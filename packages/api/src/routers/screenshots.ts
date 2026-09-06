import { IntegrationError, type IntegrationErrorCode } from '@planner/server'
import { releaseIdInput, screenshotIdInput } from '@planner/shared'
import { TRPCError } from '@trpc/server'
import { projectProcedure, router } from '../trpc'

const codes: Record<IntegrationErrorCode, TRPCError['code']> = {
  NOT_FOUND: 'NOT_FOUND',
  VERIFICATION_FAILED: 'BAD_REQUEST',
  ALREADY_IMPORTED: 'CONFLICT',
  NOT_LINKED: 'PRECONDITION_FAILED',
}

function rethrow(e: unknown): never {
  if (e instanceof IntegrationError) throw new TRPCError({ code: codes[e.code], message: e.message, cause: e })
  throw e
}

export const screenshotsRouter = router({
  list: projectProcedure
    .input(releaseIdInput)
    .query(({ ctx, input }) => ctx.services.screenshots.listForRelease(ctx.project.id, input.releaseId).catch(rethrow)),

  remove: projectProcedure
    .input(screenshotIdInput)
    .mutation(({ ctx, input }) => ctx.services.screenshots.remove(ctx.project.id, input.screenshotId).catch(rethrow)),

  pullFromAppStore: projectProcedure
    .input(releaseIdInput)
    .mutation(({ ctx, input }) =>
      ctx.services.screenshots.pullFromAppStore(ctx.project.id, input.releaseId).catch(rethrow),
    ),
})
