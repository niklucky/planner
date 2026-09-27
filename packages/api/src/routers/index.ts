import { publicProcedure, router } from '../trpc'
import { appsRouter } from './apps'
import { authRouter } from './auth'
import { integrationsRouter } from './integrations'
import { onboardingsRouter } from './onboardings'
import { projectsRouter } from './projects'
import { releasesRouter } from './releases'
import { screenshotsRouter } from './screenshots'
import { translationsRouter } from './translations'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const, time: new Date().toISOString() })),
  auth: authRouter,
  apps: appsRouter,
  projects: projectsRouter,
  integrations: integrationsRouter,
  onboardings: onboardingsRouter,
  releases: releasesRouter,
  screenshots: screenshotsRouter,
  translations: translationsRouter,
})

export type AppRouter = typeof appRouter
