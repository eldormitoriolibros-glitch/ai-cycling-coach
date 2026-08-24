import { geminiEnv } from '@/lib/env'

import 'server-only'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

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

  const response = await fetch(
    `${API_BASE}/${env.GEMINI_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
        generationConfig: {
          temperature: options.temperature ?? 0.6,
          maxOutputTokens: options.maxOutputTokens ?? 800,
        },
      }),
    }
  )

  if (response.status === 429) {
    throw new Error('Llegaste al límite gratuito de Gemini. Probá de nuevo más tarde.')
  }
  if (!response.ok) {
    // The body can echo the API key back in error details, so it is not forwarded.
    throw new Error(`Gemini respondió ${response.status}.`)
  }

  const body = (await response.json()) as GeminiResponse

  if (body.promptFeedback?.blockReason) {
    throw new Error('Gemini bloqueó la respuesta por sus filtros de contenido.')
  }

  const text = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim()

  if (!text) throw new Error('Gemini devolvió una respuesta vacía.')

  return text
}
