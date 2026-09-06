import { describe, expect, it } from 'vitest'
import { generateToken, hashToken } from './tokens'

describe('tokens', () => {
  it('hash is deterministic and differs from the token', () => {
    const { token, hash } = generateToken()
    expect(hashToken(token)).toBe(hash)
    expect(hash).not.toBe(token)
    expect(hash).toHaveLength(64)
  })
})
