import { createPrivateKey, sign } from 'node:crypto'

export interface GoogleServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

export const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const ASSERTION_TTL_SECONDS = 60 * 60

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url')

export function parseServiceAccount(json: string): GoogleServiceAccount {
  const o = JSON.parse(json) as Partial<GoogleServiceAccount>
  if (typeof o.client_email !== 'string' || typeof o.private_key !== 'string') {
    throw new Error('Service account JSON must contain client_email and private_key')
  }
  return { client_email: o.client_email, private_key: o.private_key, token_uri: o.token_uri }
}

/** RS256 JWT used as the OAuth assertion for a service account. */
export function createGoogleAssertion(sa: GoogleServiceAccount, scope: string, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000)
  const aud = sa.token_uri ?? DEFAULT_TOKEN_URI
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iss: sa.client_email, scope, aud, iat, exp: iat + ASSERTION_TTL_SECONDS }))
  const signingInput = `${header}.${payload}`
  const signature = sign('sha256', Buffer.from(signingInput), createPrivateKey(sa.private_key))
  return `${signingInput}.${b64url(signature)}`
}

export interface GoogleAccessToken {
  accessToken: string
  expiresAt: number
}

/** Exchanges the assertion for a bearer token. Throws with Google's error text on failure. */
export async function fetchGoogleAccessToken(
  sa: GoogleServiceAccount,
  scope = ANDROID_PUBLISHER_SCOPE,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleAccessToken> {
  let assertion: string
  try {
    assertion = createGoogleAssertion(sa, scope)
  } catch (e) {
    throw new Error(`Service account private key could not be read: ${(e as Error).message}`)
  }
  const res = await fetchImpl(sa.token_uri ?? DEFAULT_TOKEN_URI, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description ?? body.error ?? `Google token endpoint responded ${res.status}`)
  }
  return { accessToken: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 }
}
