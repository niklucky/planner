import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('correct horse', hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('uses a fresh salt each time', async () => {
    expect(await hashPassword('a')).not.toBe(await hashPassword('a'))
  })

  it('rejects malformed stored values', async () => {
    expect(await verifyPassword('a', 'garbage')).toBe(false)
  })
})
