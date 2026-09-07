const CONFIRM =
  /^(si|s[ií]|dale|ok|okay|va|confirmo|confirm[aá]|de acuerdo|perfecto|listo|acepto)([,!.\s]|$)|agendal[oa]|anotal[oa]|guardal[oa]|confirm[aá] (el|ese|este) cambio/i

const WRITE =
  /(agend|anot[aeá]|guard[ae]|actualiz|modific|cambi[aeá]|pasalo|pasame|pas[aá]|mov[eé]|reemplaz|replan|corre[gíi]|borr[ae]|elimina|sac[aá]|alarg|acort|sub[ií]le|bajale)/i

const BUILD_PLAN = /\b(arm[ae]|prepar[ae]|hace|hace[mn]|planifica|propon[eé])\w*.{0,40}\b(plan|semana|ciclo)\b/i

export function isPlanConfirm(message: string): boolean {
  return CONFIRM.test(message.trim())
}

/** True when the athlete is asking to create or change a saved plan. */
export function wantsPlanWrite(message: string): boolean {
  const text = message.trim()
  if (isPlanConfirm(text)) return true
  if (WRITE.test(text)) return true
  if (BUILD_PLAN.test(text)) return true
  return false
}
