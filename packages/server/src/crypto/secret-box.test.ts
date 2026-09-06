import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createSecretBox } from './secret-box'

const key = randomBytes(32).toString('base64')

describe('secret box', () => {
  it('round-trips and never repeats ciphertext', () => {
    const box = createSecretBox(key)
    const a = box.seal('{"secret":true}')
    const b = box.seal('{"secret":true}')
    expect(a).not.toBe(b)
    expect(box.open(a)).toBe('{"secret":true}')
  })

  it('rejects tampering and wrong keys', () => {
    const box = createSecretBox(key)
    const sealed = box.seal('hello')
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA')
    expect(() => box.open(tampered)).toThrow()
    expect(() => createSecretBox(randomBytes(32).toString('base64')).open(sealed)).toThrow()
  })

  it('requires a 32-byte key', () => {
    expect(() => createSecretBox('short')).toThrow(/32 bytes/)
  })
})
