import type { Db } from '@planner/db'
import { appsService } from './services/apps'
import { type AuthDeps, authService } from './services/auth'

export interface ServiceDeps extends AuthDeps {}

export function createServices(db: Db, deps: ServiceDeps) {
  return {
    apps: appsService(db),
    auth: authService(db, deps),
  }
}

export type Services = ReturnType<typeof createServices>

export { AuthError, type AuthErrorCode } from './services/auth'
export { type Mail, type Mailer, createConsoleMailer, createResendMailer } from './mail'
