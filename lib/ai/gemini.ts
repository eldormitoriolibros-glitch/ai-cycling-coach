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
 */
export async function generateReply(
  systemInstruction: string,
  history: ChatTurn[],
  options: { temperature?: number; maxOutputTokens?: number } = {}
): Promise<string> {
  const env = geminiEnv()
  if (!env) throw new AiNotConfiguredError()

  let result = await callModel(env.GEMINI_MODEL, env.GEMINI_API_KEY, systemInstruction, history, options)

  if (!result.ok && result.suggestedModel) {
    const retry = await callModel(
      result.suggestedModel,
      env.GEMINI_API_KEY,
      systemInstruction,
      history,
      options
    )

    if (retry.ok) {
      console.warn(
        `GEMINI_MODEL "${env.GEMINI_MODEL}" is retired; this request used "${result.suggestedModel}". Update the env var.`
      )
      return retry.text
    }

    result = retry
  }

  if (result.ok) return result.text

  if (result.status === 429) {
    throw new Error('Llegaste al límite gratuito de Gemini. Probá de nuevo más tarde.')
  }
  if (result.status === 404) {
    throw new Error(
      `El modelo "${env.GEMINI_MODEL}" no está disponible para tu clave. Cambiá GEMINI_MODEL. Detalle: ${result.message}`
    )
  }

  throw new Error(result.message)
}
