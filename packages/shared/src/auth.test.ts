import { describe, expect, it } from 'vitest'
import { loginInput, registerInput } from './auth'

describe('auth schemas', () => {
  it('normalizes email', () => {
    const r = loginInput.parse({ email: '  Nikita@Example.COM ', password: 'x' })
    expect(r.email).toBe('nikita@example.com')
  })

  it('requires 8+ char password on register', () => {
    const r = registerInput.safeParse({ email: 'a@b.co', name: 'A', password: 'short' })
    expect(r.success).toBe(false)
  })
})
