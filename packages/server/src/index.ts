import type { Db } from '@planner/db'
import { appsService } from './services/apps'
import { type AuthDeps, authService } from './services/auth'
import { type IntegrationDeps, integrationsService } from './services/integrations'
import { projectsService } from './services/projects'
import { releasesService } from './services/releases'

export interface ServiceDeps extends AuthDeps, IntegrationDeps {}

export function createServices(db: Db, deps: ServiceDeps) {
  const integrations = integrationsService(db, deps)
  return {
    apps: appsService(db),
    auth: authService(db, deps),
    integrations,
    projects: projectsService(db),
    releases: releasesService(db, { integrations }),
  }
}

export type Services = ReturnType<typeof createServices>

export { AuthError, type AuthErrorCode } from './services/auth'
export { IntegrationError, type IntegrationErrorCode } from './services/integrations'
export { type SecretBox, createSecretBox } from './crypto/secret-box'
export { type Mail, type Mailer, createConsoleMailer, createResendMailer } from './mail'
