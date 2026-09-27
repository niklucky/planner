import { IntegrationError, type IntegrationErrorCode } from '@planner/server'
import { releaseIdInput, saveReleaseNotesInput } from '@planner/shared'
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

export const releasesRouter = router({
  list: projectProcedure.query(({ ctx }) => ctx.services.releases.listForProject(ctx.project.id)),

  get: projectProcedure
    .input(releaseIdInput)
    .query(({ ctx, input }) => ctx.services.releases.get(ctx.project.id, input.releaseId).catch(rethrow)),

  saveNotes: projectProcedure
    .input(saveReleaseNotesInput)
    .mutation(({ ctx, input }) =>
      ctx.services.releases
        .saveNotes(ctx.project.id, { releaseId: input.releaseId, notesMode: input.notesMode, notes: input.notes })
        .catch(rethrow),
    ),

  pushNotes: projectProcedure
    .input(releaseIdInput)
    .mutation(({ ctx, input }) => ctx.services.releases.pushNotes(ctx.project.id, input.releaseId).catch(rethrow)),

  pullNotes: projectProcedure
    .input(releaseIdInput)
    .mutation(({ ctx, input }) => ctx.services.releases.pullNotes(ctx.project.id, input.releaseId).catch(rethrow)),
})
