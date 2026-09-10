export type CoachChannel = 'web' | 'telegram'

/**
 * Fixed order: app RULES, optional doctrine, Telegram constraint, athlete snapshot.
 * An empty doctrine must not leave a lone "# Doctrina" heading (token budget).
 */
export function composeCoachSystemPrompt(input: {
  rules: string
  doctrine: string
  athleteContext: string
  channel: CoachChannel
}): string {
  const parts = [input.rules.trim()]
  const doctrine = input.doctrine.trim()
  if (doctrine) parts.push(doctrine)
  if (input.channel === 'telegram') {
    parts.push('Estás respondiendo por Telegram: sin markdown, texto plano y breve.')
  }
  parts.push('# Contexto del atleta', input.athleteContext.trim())
  return parts.filter(Boolean).join('\n\n')
}

/** Doctrine first so REVIEW_RULES (12-line cap) still wins on format. */
export function composeReviewSystemPrompt(doctrineReview: string, reviewRules: string): string {
  return [doctrineReview.trim(), reviewRules.trim()].filter(Boolean).join('\n\n')
}
