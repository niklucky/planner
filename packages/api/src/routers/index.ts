import { publicProcedure, router } from '../trpc'
import { appsRouter } from './apps'
import { authRouter } from './auth'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const, time: new Date().toISOString() })),
  auth: authRouter,
  apps: appsRouter,
})

export type AppRouter = typeof appRouter
