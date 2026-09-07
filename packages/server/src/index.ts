import type { Db } from '@planner/db'
import { appsService } from './services/apps'
import { type AuthDeps, authService } from './services/auth'
import { type IntegrationDeps, integrationsService } from './services/integrations'
import { type ProjectDeps, projectsService } from './services/projects'
import { releasesService } from './services/releases'
import { screenshotsService } from './services/screenshots'
import { translationsService } from './services/translations'
import type { Storage } from './storage'

export interface ServiceDeps extends AuthDeps, IntegrationDeps, ProjectDeps {
  storage: Storage
}

export function createServices(db: Db, deps: ServiceDeps) {
  const integrations = integrationsService(db, deps)
  return {
    apps: appsService(db),
    auth: authService(db, deps),
    integrations,
    projects: projectsService(db, deps),
    releases: releasesService(db, { integrations }),
    screenshots: screenshotsService(db, { integrations, storage: deps.storage }),
    translations: translationsService({ integrations }),
  }
}

export type Services = ReturnType<typeof createServices>

export { AuthError, type AuthErrorCode } from './services/auth'
export { IntegrationError, type IntegrationErrorCode } from './services/integrations'
export { ProjectError, type ProjectErrorCode } from './services/projects'
export { type SecretBox, createSecretBox } from './crypto/secret-box'
export { type Mail, type Mailer, createConsoleMailer, createResendMailer } from './mail'
export { type Storage, createLocalStorage } from './storage'
export { type UploadedFile } from './services/screenshots'
