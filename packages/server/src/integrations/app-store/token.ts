import { createPrivateKey, sign } from 'node:crypto'
import type { AppStoreCredentials } from '@planner/shared'

/** Apple caps token lifetime at 20 minutes. */
export const TOKEN_TTL_SECONDS = 15 * 60

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url')

/** ES256 JWT for the App Store Connect API. */
export function createAppStoreToken(creds: AppStoreCredentials, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000)
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: creds.keyId, typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({ iss: creds.issuerId, iat, exp: iat + TOKEN_TTL_SECONDS, aud: 'appstoreconnect-v1' }),
  )
  const signingInput = `${header}.${payload}`
  const key = createPrivateKey(creds.privateKey)
  const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' })
  return `${signingInput}.${b64url(signature)}`
}
