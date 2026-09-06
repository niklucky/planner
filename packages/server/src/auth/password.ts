import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64
const PARAMS = { N: 16384, r: 8, p: 1 }

function derive(password: string, salt: Buffer, keyLength: number, params: typeof PARAMS) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, params, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

/** Returns `scrypt$N$r$p$salt$hash` (salt and hash base64url). */
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await derive(password, salt, KEY_LENGTH, PARAMS)
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), key.toString('base64url')].join('$')
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, N, r, p, salt, hash] = stored.split('$')
  if (algo !== 'scrypt' || !N || !r || !p || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const key = await derive(password, Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  })
  return timingSafeEqual(key, expected)
}
