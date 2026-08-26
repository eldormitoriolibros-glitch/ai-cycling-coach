import { geminiEnv } from '@/lib/env'

import 'server-only'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Current Gemini flash models are reasoning models: they spend hidden "thinking"
 * tokens before emitting text, and those count against maxOutputTokens. Roughly
 * 500 are typical, so the budget has to leave room for them or the response
 * comes back empty.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 2048

export type ChatTurn = { role: 'user' | 'model'; text: string }

export class AiNotConfiguredError extends Error {
  constructor() {
    super('Falta configurar GEMINI_API_KEY.')
    this.name = 'AiNotConfiguredError'
  }
}

export function isAiConfigured(): boolean {
  return geminiEnv() !== null
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; status?: string }
}

type CallResult =
  | { ok: true; text: string }
  | { ok: false; status: number; message: string; suggestedModel?: string }

/**
 * Google retires model names without warning, and the 404 body names the
 * replacement ("...use models/gemini-3.6-flash..."). Pull it out so a retirement
 * degrades into one retry instead of taking the coach down.
 */
function suggestedModelFrom(message: string): string | undefined {
  const pattern = /models\/([A-Za-z0-9._-]+)/g
  const names: string[] = []

  for (let match = pattern.exec(message); match !== null; match = pattern.exec(message)) {
    names.push(match[1])
  }

  return names.length > 1 ? names[names.length - 1] : undefined
}

async function callModel(
  model: string,
  apiKey: string,
  systemInstruction: string,
  history: ChatTurn[],
  options: { temperature?: number; maxOutputTokens?: number }
): Promise<CallResult> {
  const response = await fetch(`${API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      generationConfig: {
        temperature: options.temperature ?? 0.6,
        maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      },
    }),
  })

  const body = (await response.json().catch(() => null)) as GeminiResponse | null

  if (!response.ok) {
    // The key travels in the query string, never in the body, so this is safe to surface.
    const message = body?.error?.message ?? `HTTP ${response.status}`
    return {
      ok: false,
      status: response.status,
      message,
      suggestedModel: response.status === 404 ? suggestedModelFrom(message) : undefined,
    }
  }

  if (body?.promptFeedback?.blockReason) {
    return {
      ok: false,
      status: 200,
      message: 'Gemini bloqueó la respuesta por sus filtros de contenido.',
    }
  }

  const candidate = body?.candidates?.[0]
  const text = candidate?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim()

  if (!text) {
    const reason =
      candidate?.finishReason === 'MAX_TOKENS'
        ? 'gastó todo el presupuesto de tokens razonando antes de escribir'
        : (candidate?.finishReason ?? 'sin motivo declarado')
    return { ok: false, status: 200, message: `Gemini devolvió una respuesta vacía (${reason}).` }
  }

  return { ok: true, text }
}

/**
 * Calls Gemini's REST API directly — the free tier is enough for one athlete and
 * this avoids pulling in an SDK just to POST JSON.
 *
 * `options.models`, when given, is tried in order (first success wins) so a
 * quota-exhausted or retired model degrades into the next one instead of
 * failing the whole request. Build that list with `chooseModels` below.
 */
export async function generateReply(
  systemInstruction: string,
  history: ChatTurn[],
  options: { temperature?: number; maxOutputTokens?: number; models?: string[] } = {}
): Promise<string> {
  const env = geminiEnv()
  if (!env) throw new AiNotConfiguredError()

  const candidates = options.models?.length ? options.models : [env.GEMINI_MODEL]
  const failures: Extract<CallResult, { ok: false }>[] = []

  for (const model of candidates) {
    let result = await callModel(model, env.GEMINI_API_KEY, systemInstruction, history, options)

    if (!result.ok && result.suggestedModel) {
      const retry = await callModel(result.suggestedModel, env.GEMINI_API_KEY, systemInstruction, history, options)
      if (retry.ok) {
        console.warn(`Gemini model "${model}" is retired; used "${result.suggestedModel}" instead.`)
        return retry.text
      }
      result = retry
    }

    if (result.ok) return result.text
    failures.push(result)
  }

  if (failures.some((f) => f.status === 429)) {
    throw new Error(
      candidates.length > 1
        ? 'Llegaste al límite gratuito de Gemini en todos los modelos disponibles. Probá de nuevo más tarde.'
        : 'Llegaste al límite gratuito de Gemini. Probá de nuevo más tarde.'
    )
  }

  const last = failures[failures.length - 1]
  if (last?.status === 404) {
    throw new Error(
      `Ninguno de los modelos probados (${candidates.join(', ')}) está disponible para tu clave. Detalle: ${last.message}`
    )
  }

  throw new Error(last?.message ?? 'No se pudo contactar a Gemini.')
}

let modelCatalogCache: { models: string[]; fetchedAt: number } | null = null
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000 // 6h — the catalog barely changes within a day.

/** Which models this API key can actually call, straight from Gemini's own listing endpoint. */
async function listAvailableModels(apiKey: string): Promise<string[]> {
  if (modelCatalogCache && Date.now() - modelCatalogCache.fetchedAt < CATALOG_TTL_MS) {
    return modelCatalogCache.models
  }

  try {
    const response = await fetch(`${API_BASE}?key=${encodeURIComponent(apiKey)}`, { cache: 'no-store' })
    if (!response.ok) return []

    const body = (await response.json()) as {
      models?: Array<{ name: string; supportedGenerationMethods?: string[] }>
    }
    const names = (body.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))

    modelCatalogCache = { models: names, fetchedAt: Date.now() }
    return names
  } catch {
    return [] // Discovery is best-effort; callers fall back to the pinned model.
  }
}

/** Rougher = more capable (and slower/lower quota); used only to order fallback attempts. */
function capabilityScore(modelName: string): number {
  const n = modelName.toLowerCase()
  let score = 0
  if (n.includes('pro')) score += 3
  if (n.includes('flash')) score += 1
  if (n.includes('lite') || n.includes('mini') || n.includes('nano')) score -= 1
  if (n.includes('exp') || n.includes('preview')) score -= 2 // avoid unstable previews as a first choice
  return score
}

/**
 * Builds the ordered list of models to try for one reply: the pinned
 * `GEMINI_MODEL` first (respects an explicit choice), then the rest of the
 * discovered catalog ranked by capability — most-capable first for a
 * complex ask (evaluations, plans), lightest first for a quick question, so
 * simple messages don't burn the strongest model's daily quota.
 */
export async function chooseModels(apiKey: string, preferredModel: string, userMessage: string): Promise<string[]> {
  const catalog = await listAvailableModels(apiKey)
  if (!catalog.length) return [preferredModel]

  const isComplex =
    userMessage.length > 220 || /evalu|analiz|compar|progreso|\bplan\b|semana|zona|rendimiento|ftp|carga/i.test(userMessage)

  const ranked = [...catalog].sort((a, b) => capabilityScore(b) - capabilityScore(a))
  const ordered = isComplex ? ranked : [...ranked].reverse()

  // Cap attempts: each fallback is a full extra request, and this runs on every message.
  return Array.from(new Set([preferredModel, ...ordered])).slice(0, 3)
}

