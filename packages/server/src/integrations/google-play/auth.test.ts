import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ANDROID_PUBLISHER_SCOPE, createGoogleAssertion, parseServiceAccount } from './auth'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const sa = { client_email: 'planner@project.iam.gserviceaccount.com', private_key: pem }

describe('Google service account auth', () => {
  it('signs an RS256 assertion with the expected claims', () => {
    const token = createGoogleAssertion(sa, ANDROID_PUBLISHER_SCOPE, 1_700_000_000_000)
    const [h, p, s] = token.split('.') as [string, string, string]
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({
      iss: sa.client_email,
      scope: ANDROID_PUBLISHER_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    })
    expect(verify('sha256', Buffer.from(`${h}.${p}`), createPublicKey(privateKey), Buffer.from(s, 'base64url'))).toBe(
      true,
    )
  })

  it('rejects JSON without the required fields', () => {
    expect(() => parseServiceAccount('{"client_email":"x"}')).toThrow(/private_key/)
  })
})
