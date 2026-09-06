import { publicProcedure, router } from '../trpc'
import { appsRouter } from './apps'
import { authRouter } from './auth'
import { integrationsRouter } from './integrations'
import { projectsRouter } from './projects'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const, time: new Date().toISOString() })),
  auth: authRouter,
  apps: appsRouter,
  projects: projectsRouter,
  integrations: integrationsRouter,
})

export type AppRouter = typeof appRouter
