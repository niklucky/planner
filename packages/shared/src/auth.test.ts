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

describe('appStoreCredentialsInput', () => {
  it('accepts Apple-style issuer ids that are not RFC 4122 uuids', async () => {
    const { appStoreCredentialsInput } = await import('./integrations')
    const r = appStoreCredentialsInput.safeParse({
      issuerId: '57246542-96fe-1a63-e053-0824d011072a',
      keyId: 'ABC123DEFG',
      privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    })
    expect(r.success).toBe(true)
  })
})
