import { IntegrationError, type IntegrationErrorCode } from '@planner/server'
import { importAppInput } from '@planner/shared'
import { TRPCError } from '@trpc/server'
import { projectProcedure, router } from '../trpc'

const codes: Record<IntegrationErrorCode, TRPCError['code']> = {
  NOT_FOUND: 'NOT_FOUND',
  VERIFICATION_FAILED: 'BAD_REQUEST',
  ALREADY_IMPORTED: 'CONFLICT',
}

export const appsRouter = router({
  list: projectProcedure.query(({ ctx }) => ctx.services.apps.listForProject(ctx.project.id)),

  importFromStore: projectProcedure.input(importAppInput).mutation(({ ctx, input }) =>
    ctx.services.integrations
      .importApp(ctx.project.id, { integrationId: input.integrationId, externalId: input.externalId })
      .catch((e: unknown) => {
        if (e instanceof IntegrationError) throw new TRPCError({ code: codes[e.code], message: e.message, cause: e })
        throw e
      }),
  ),
})
