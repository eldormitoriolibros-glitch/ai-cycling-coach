import { describe, expect, it } from 'vitest'
import { stitchContinuation, looksTruncatedReply } from '@/lib/ai/reply-complete'

describe('stitchContinuation', () => {
  it('appends the tail on a new line', () => {
    expect(stitchContinuation('Te armé la propuesta:\n\n| Día |', '| Sesión |\n| lun | Z1 |')).toBe(
      'Te armé la propuesta:\n\n| Día |\n| Sesión |\n| lun | Z1 |'
    )
  })

  it('drops an echoed last paragraph', () => {
    const head = 'Intro.\n\nTe armé la propuesta para esa semana:'
    const tail = 'Te armé la propuesta para esa semana:\n\n| Día | Sesión |'
    expect(stitchContinuation(head, tail)).toBe('Intro.\n\nTe armé la propuesta para esa semana:\n\n| Día | Sesión |')
  })
})

describe('looksTruncatedReply', () => {
  it('flags a week table cut mid-header', () => {
    expect(
      looksTruncatedReply(
        'Acá tenés la propuesta completa:\n| Día | Sesión | Duración total | Bloques (entrada / trabajo'
      )
    ).toBe(true)
  })

  it('does not flag a finished table row', () => {
    expect(
      looksTruncatedReply(
        'Propuesta:\n\n| Día | Sesión |\n| --- | --- |\n| lun | Z1 suave |'
      )
    ).toBe(false)
  })
})
