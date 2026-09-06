import { z } from 'zod'

// Load the repo-root .env when present; existing env vars take precedence.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname)
} catch {}

const optional = (s: z.ZodString) => z.preprocess((v) => (v === '' ? undefined : v), s.optional())

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  /** Directory with the built web app, served by the API in production. */
  STATIC_DIR: z.string().default('../../apps/app/dist'),
  /** Public URL of the web app, used in emails. */
  APP_URL: z.string().default('http://localhost:5173'),
  RESEND_API_KEY: optional(z.string()),
  EMAIL_FROM: z.string().default('Planner <noreply@example.com>'),
  /** 32 bytes, base64. Encrypts stored integration credentials. */
  ENCRYPTION_KEY: z.string().min(1, 'ENCRYPTION_KEY is required (openssl rand -base64 32)'),
  /** Directory for uploaded files (screenshots). */
  STORAGE_DIR: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().default(new URL('../../../data/storage', import.meta.url).pathname),
  ),
})

export const env = schema.parse(process.env)
export type Env = typeof env
