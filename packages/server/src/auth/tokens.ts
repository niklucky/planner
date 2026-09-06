import { createHash, randomBytes } from 'node:crypto'

/** Only the hash is stored; the raw token goes to the client (cookie or email link). */
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function generateToken(bytes = 32) {
  const token = randomBytes(bytes).toString('base64url')
  return { token, hash: hashToken(token) }
}
