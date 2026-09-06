import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'
const IV_LENGTH = 12
const TAG_LENGTH = 16

export interface SecretBox {
  seal(plaintext: string): string
  open(sealed: string): string
}

/** AES-256-GCM. `keyBase64` must decode to 32 bytes (`openssl rand -base64 32`). */
export function createSecretBox(keyBase64: string): SecretBox {
  const key = Buffer.from(keyBase64, 'base64')
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes, base64-encoded. Generate one with: openssl rand -base64 32')
  }
  return {
    seal(plaintext) {
      const iv = randomBytes(IV_LENGTH)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')}`
    },
    open(sealed) {
      const [version, body] = sealed.split('.')
      if (version !== VERSION || !body) throw new Error('Unsupported sealed format')
      const buf = Buffer.from(body, 'base64')
      const iv = buf.subarray(0, IV_LENGTH)
      const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
      const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    },
  }
}
