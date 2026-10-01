import { EnvironmentError, type EnvironmentErrorCode } from '@planner/server'
import { createEnvironmentInput, environmentIdInput, renameEnvironmentInput } from '@planner/shared'
import { TRPCError } from '@trpc/server'
import { type Context, projectProcedure, router } from '../trpc'

const codes: Record<EnvironmentErrorCode, TRPCError['code']> = {
  NOT_FOUND: 'NOT_FOUND',
  INVALID: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',
}

function rethrow(e: unknown): never {
  if (e instanceof EnvironmentError) throw new TRPCError({ code: codes[e.code], message: e.message, cause: e })
  throw e
}

function requireOwner(ctx: Context & { project: { role: string } }) {
  if (ctx.project.role !== 'owner')
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the project owner can manage environments' })
}

export const environmentsRouter = router({
  list: projectProcedure.query(({ ctx }) => ctx.services.environments.list(ctx.project.id)),

  create: projectProcedure.input(createEnvironmentInput).mutation(({ ctx, input }) => {
    requireOwner(ctx)
    return ctx.services.environments.create(ctx.project.id, input.name).catch(rethrow)
  }),

  rename: projectProcedure.input(renameEnvironmentInput).mutation(({ ctx, input }) => {
    requireOwner(ctx)
    return ctx.services.environments.rename(ctx.project.id, input.environmentId, input.name).catch(rethrow)
  }),

  remove: projectProcedure.input(environmentIdInput).mutation(({ ctx, input }) => {
    requireOwner(ctx)
    return ctx.services.environments.remove(ctx.project.id, input.environmentId).catch(rethrow)
  }),
})
