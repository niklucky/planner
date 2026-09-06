import type { Services } from '@planner/server'
import { TRPCError, initTRPC } from '@trpc/server'
import type { SessionCookie } from './session-cookie'

export interface Context {
  services: Services
  session: SessionCookie
}

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure

/** Requires a valid session; adds `ctx.user`. */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const token = ctx.session.get()
  const user = token ? await ctx.services.auth.getUserBySession(token) : null
  if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { user } })
})
