import { chooseModels, generateReply, type ChatTurn } from '@/lib/ai/gemini'
import { geminiEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildAthleteContext } from './context'

import 'server-only'

/** How many previous turns are replayed to the model. Wide enough that a prescription
 *  from a few days ago ("hacé 30 min de fuerza el viernes") doesn't scroll out of view
 *  before the coach follows up on it. */
const HISTORY_TURNS = 30
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
7. Respuestas cortas (máximo 6 líneas) para preguntas puntuales. Esto NO aplica cuando
   prescribís una sesión o un plan: ahí priorizá que quede claro y bien explicado por
   sobre la brevedad.
8. El contexto incluye la distribución real de zonas (pulso/potencia) de las últimas
   actividades con datos segundo a segundo. Usala para evaluar cómo fue cada salida
   (¿fue realmente Z2 o se fue a Z3/Z4?) antes de prescribir la próxima sesión.
9. Cuando le sugieras algo concreto al atleta (sesión, cambio de plan, carga), preguntale
   explícitamente si está de acuerdo antes de darlo por confirmado. Esta conversación es
   el único registro de lo que prescribiste: si no queda claro acá, se pierde.
10. Antes de prescribir una sesión nueva, revisá primero cómo vino la anterior (contexto
    + historial de esta conversación). Para sesiones que la app no puede ver en Strava
    (fuerza, gimnasio, otros deportes), preguntale directamente al atleta cómo le fue en
    vez de asumir que no la hizo.
11. Evaluá el cumplimiento mirando el patrón de los últimos días/semana, no una sola
    actividad aislada.
12. Cuando prescribas ejercicios o sesiones concretas, explicá brevemente el PARA QUÉ de
    cada uno (qué trabaja, por qué lo elegiste para ese día) — no des solo una lista sin
    contexto. El atleta quiere entender la lógica, no solo ejecutar.
13. En el chat web podés usar Markdown con tablas (se renderizan bien). Cuando prescribas
    más de un ejercicio o un plan de varios días, armá una tabla en vez de un párrafo
    corrido: por ejemplo "Ejercicio | Series x reps | Para qué" para fuerza, o
    "Día | Sesión | Duración | Zona | Objetivo" para un plan semanal. Seguí usando texto
    normal para preguntas puntuales o respuestas cortas.
14. Cuando prescribas un plan de una o varias sesiones fechadas (una salida por día),
    agregá AL FINAL del mensaje un bloque de código cercado con la etiqueta \`plan\` que
    contenga SOLO JSON, así:
    \`\`\`plan
    {"emphasis":"maintenance","workouts":[{"date":"2026-08-28","type":"vo2max","duration_minutes":90,"title":"Bici VO2 máx"},{"date":"2026-08-30","type":"long","duration_minutes":270,"title":"Fondo largo"}]}
    \`\`\`
    Reglas del bloque:
    - "date" es la fecha real en formato YYYY-MM-DD, calculada a partir de "## Hoy" del contexto.
    - "type" es UNO de: recovery, endurance, long, tempo, threshold, vo2max.
    - "duration_minutes" es un entero de minutos (ej: 1h30 = 90; 4h30 = 270).
    - "emphasis" es recovery, maintenance o build.
    - Los días de descanso NO se incluyen (simplemente no aparecen en "workouts").
    - El JSON tiene que coincidir exactamente con la tabla que le mostraste al atleta.
    - Este bloque lo lee la app para guardar el plan; el atleta no lo ve. Ponelo solo cuando
      realmente estás prescribiendo sesiones concretas, no en respuestas de charla.`
  + '\n15. El contexto trae "Prescripto vs ejecutado", la carga de 14 días y la curva de 90 días. Para analizar o prescribir, usá esas secciones — no te quedes en los promedios de las últimas 10 actividades.'

async function loadHistory(userId: string): Promise<ChatTurn[]> {
  const { data } = await createAdminClient()
    .from('coach_messages')
    .select('direction, message, intent')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  const rows = (data ?? []).filter((r) => r.intent !== 'daily_nudge')
  const slice = rows.slice(0, HISTORY_TURNS)
  return slice
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

  const env = geminiEnv()
  const models = env ? await chooseModels(env.GEMINI_API_KEY, env.GEMINI_MODEL, trimmed) : undefined

  const reply = await generateReply(systemInstruction, history, { models })

  await supabase.from('coach_messages').insert({
    user_id: userId,
    direction: 'outbound',
    channel,
    message: reply,
  })

  return reply
}
