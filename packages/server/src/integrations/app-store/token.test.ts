import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { TOKEN_TTL_SECONDS, createAppStoreToken } from './token'

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const creds = { issuerId: '57246542-96fe-1a63-e053-0824d011072a', keyId: 'ABC123DEFG', privateKey: pem }

describe('App Store Connect token', () => {
  it('produces a valid ES256 JWT with Apple claims', () => {
    const now = 1_700_000_000_000
    const token = createAppStoreToken(creds, now)
    const [h, p, s] = token.split('.') as [string, string, string]

    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'ABC123DEFG', typ: 'JWT' })
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({
      iss: creds.issuerId,
      iat: 1_700_000_000,
      exp: 1_700_000_000 + TOKEN_TTL_SECONDS,
      aud: 'appstoreconnect-v1',
    })
    const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key: createPublicKey(privateKey), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))
    expect(ok).toBe(true)
  })

  it('rejects a malformed private key', () => {
    expect(() => createAppStoreToken({ ...creds, privateKey: 'not a key' })).toThrow()
  })
})
