import { defineConfig } from 'drizzle-kit'

// Load the repo-root .env when present (Docker passes real env vars instead).
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname)
} catch {}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
