import { generateReply, type ChatTurn } from '@/lib/ai/gemini'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildAthleteContext } from './context'

import 'server-only'

/** How many previous turns are replayed to the model. */
const HISTORY_TURNS = 12
const MAX_MESSAGE_LENGTH = 2000

export type Channel = 'web' | 'telegram'

const RULES = `Sos un entrenador de ciclismo personal. Hablás en español rioplatense, directo y cálido, sin tutear de más ni sonar robótico.

Reglas que no podés romper:
1. Usá SOLO los datos del contexto. Si falta un dato, decilo y pedilo; nunca lo inventes ni lo estimes en silencio.
2. Las métricas de carga (CTL, ATL, TSB, TSS) las calcula esta app a partir de potencia o frecuencia cardíaca. No son métricas nativas de Strava ni de Garmin. Aclaralo si el atleta pregunta de dónde salen.
3. No das diagnósticos médicos. Si aparecen síntomas (dolor de pecho, mareos, lesión, fiebre), recomendá parar y consultar a un profesional de la salud.
4. Respetá la disponibilidad declarada. No propongas sesiones más largas que el máximo del día, ni en días marcados como no disponibles.
5. Antes de cambiar un plan ya existente, proponelo y pedí confirmación explícita.
6. Sé concreto: duración, zona o potencia objetivo, y por qué. Nada de consejos genéricos.
7. Respuestas cortas. Máximo 6 líneas salvo que te pidan un plan completo.`

async function loadHistory(userId: string): Promise<ChatTurn[]> {
  const { data } = await createAdminClient()
    .from('coach_messages')
    .select('direction, message')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_TURNS)

  return (data ?? [])
    .reverse()
    .map((row) => ({ role: row.direction === 'inbound' ? 'user' : 'model', text: row.message }) as ChatTurn)
}

/**
 * Full coach turn: persist the question, answer with the athlete's data in
 * context, persist the answer. The inbound message is stored before the model
 * call so nothing is lost if Gemini fails.
 */
export async function askCoach(
  userId: string,
  message: string,
  channel: Channel
): Promise<string> {
  const trimmed = message.trim().slice(0, MAX_MESSAGE_LENGTH)
  if (!trimmed) throw new Error('El mensaje está vacío.')

  const supabase = createAdminClient()

  await supabase.from('coach_messages').insert({
    user_id: userId,
    direction: 'inbound',
    channel,
    message: trimmed,
  })

  const [context, history] = await Promise.all([buildAthleteContext(userId), loadHistory(userId)])

  const systemInstruction = [
    RULES,
    channel === 'telegram' ? '\nEstás respondiendo por Telegram: sin markdown, texto plano y breve.' : '',
    '\n# Contexto del atleta\n',
    context,
  ].join('\n')

  const reply = await generateReply(systemInstruction, history)

  await supabase.from('coach_messages').insert({
    user_id: userId,
    direction: 'outbound',
    channel,
    message: reply,
  })

  return reply
}
