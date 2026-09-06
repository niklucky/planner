import { serve } from '@hono/node-server'
import { createDb } from '@planner/db'
import { createConsoleMailer, createLocalStorage, createResendMailer, createSecretBox, createServices } from '@planner/server'
import { env } from '@planner/server/env'
import { createApp } from './app'

const production = env.NODE_ENV === 'production'

const mailer = env.RESEND_API_KEY
  ? createResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM)
  : createConsoleMailer()
if (!env.RESEND_API_KEY) console.warn('RESEND_API_KEY is not set: emails are printed to the console')

const db = createDb(env.DATABASE_URL)
const secretBox = createSecretBox(env.ENCRYPTION_KEY)
const storage = createLocalStorage(env.STORAGE_DIR)
const services = createServices(db, { mailer, appUrl: env.APP_URL, secretBox, storage })
const app = createApp(services, {
  staticDir: production ? env.STATIC_DIR : undefined,
  secureCookies: production,
})

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`planner api listening on http://localhost:${info.port}`)
})
