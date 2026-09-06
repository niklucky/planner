import type { Services } from '@planner/server'
import { projectScopedInput } from '@planner/shared'
import { TRPCError, initTRPC } from '@trpc/server'
import superjson from 'superjson'
import type { SessionCookie } from './session-cookie'

export interface Context {
  services: Services
  session: SessionCookie
}

const t = initTRPC.context<Context>().create({ transformer: superjson })

export const router = t.router
export const publicProcedure = t.procedure

/** Requires a valid session; adds `ctx.user`. */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const token = ctx.session.get()
  const user = token ? await ctx.services.auth.getUserBySession(token) : null
  if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { user } })
})

/** Takes `projectId` in the input and requires membership; adds `ctx.project`. */
export const projectProcedure = protectedProcedure.input(projectScopedInput).use(async ({ ctx, input, next }) => {
  const project = await ctx.services.projects.getForUser(ctx.user.id, input.projectId)
  if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' })
  return next({ ctx: { project } })
})
