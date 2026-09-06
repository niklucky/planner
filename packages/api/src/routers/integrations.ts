import { IntegrationError, type IntegrationErrorCode } from '@planner/server'
import { appStoreCredentialsInput, integrationIdInput } from '@planner/shared'
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

export const integrationsRouter = router({
  list: projectProcedure.query(({ ctx }) => ctx.services.integrations.listForProject(ctx.project.id)),

  connectAppStore: projectProcedure
    .input(appStoreCredentialsInput)
    .mutation(({ ctx, input }) =>
      ctx.services.integrations
        .connectAppStore(ctx.project.id, {
          issuerId: input.issuerId,
          keyId: input.keyId,
          privateKey: input.privateKey,
        })
        .catch(rethrow),
    ),

  verify: projectProcedure
    .input(integrationIdInput)
    .mutation(({ ctx, input }) => ctx.services.integrations.verify(ctx.project.id, input.integrationId).catch(rethrow)),

  remoteApps: projectProcedure
    .input(integrationIdInput)
    .query(({ ctx, input }) =>
      ctx.services.integrations.listRemoteApps(ctx.project.id, input.integrationId).catch(rethrow),
    ),

  remove: projectProcedure
    .input(integrationIdInput)
    .mutation(({ ctx, input }) => ctx.services.integrations.remove(ctx.project.id, input.integrationId).catch(rethrow)),
})
