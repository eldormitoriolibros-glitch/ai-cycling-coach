import { addDays, dayOfWeek } from '@/lib/training/dates'

const COMMAND = /^\/devoluci[oó]n\b/i
const ASK =
  /\b(dame|d[aá]mela|mandame|mandamela|pasame|pasamela|quiero|pedime)\b.{0,32}\bdevoluci[oó]n\b/i
const HOW_IT_WENT = /\bc[oó]mo me fue\b/i
const REVIEW_SESSION =
  /\b(analiz[aá]|evalu[aá]|revis[aá])(me)? (la |mi |lo de )?(sesi[oó]n|salida|bici|ayer)\b/i

const WEEKDAY: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miércoles: 3,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
  sabado: 6,
}

/** True when the athlete is asking for a post-session review. */
export function wantsSessionReview(message: string): boolean {
  const text = message.trim()
  return COMMAND.test(text) || ASK.test(text) || HOW_IT_WENT.test(text) || REVIEW_SESSION.test(text)
}

/**
 * Optional day the athlete pointed at ("ayer", "el domingo", an ISO date).
 * `today` is `YYYY-MM-DD` in their timezone.
 */
export function parseReviewDate(message: string, today: string): string | null {
  const text = message.trim().toLowerCase()
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)
  if (iso) return iso[1]
  if (/\bhoy\b/.test(text)) return today
  if (/\bayer\b/.test(text)) return addDays(today, -1)
  if (/\banteayer\b/.test(text)) return addDays(today, -2)

  const weekday = /\b(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\b/.exec(text)
  if (!weekday) return null
  const target = WEEKDAY[weekday[1]]
  if (target === undefined) return null
  const delta = (dayOfWeek(today) - target + 7) % 7
  return addDays(today, delta === 0 ? 0 : -delta)
}
