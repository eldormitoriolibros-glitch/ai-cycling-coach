/** Append a continuation without duplicating the last paragraph if the model echoed it. */
export function stitchContinuation(head: string, tail: string): string {
  const a = head.replace(/\s+$/, '')
  const b = tail.replace(/^\s+/, '')
  if (!b) return a
  const lastPara = a.split(/\n{2,}/).pop() ?? ''
  if (lastPara.length >= 20 && b.startsWith(lastPara)) {
    return `${a.slice(0, a.length - lastPara.length)}${b}`
  }
  return `${a}\n${b}`
}

/** Visible reply that looks cut mid-table, mid-JSON, or mid-sentence. */
export function looksTruncatedReply(text: string): boolean {
  const t = text.trimEnd()
  if (!t) return false

  const fences = t.match(/```/g)?.length ?? 0
  if (fences % 2 === 1) return true

  const last = (t.split('\n').filter((line) => line.trim()).pop() ?? '').trimEnd()
  if (/[,(]$/.test(last)) return true
  if (last.startsWith('|') && !/\|$/.test(last)) return true
  if (last.startsWith('|') && last.includes('(') && !last.includes(')')) return true
  if (/propuesta|tabla/i.test(t) && t.includes('| Día') && (t.match(/^\|/gm)?.length ?? 0) <= 1) return true
  return false
}

export function shouldContinueReply(finishReason: string | undefined, text: string): boolean {
  const reason = (finishReason ?? '').toUpperCase()
  if (reason === 'MAX_TOKENS' || reason === 'LENGTH') return true
  return looksTruncatedReply(text)
}

