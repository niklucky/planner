import { IntegrationError, type IntegrationErrorCode } from '@planner/server'
import {
  appStoreCredentialsInput,
  googlePlayCredentialsInput,
  integrationIdInput,
  translationSettingsInput,
} from '@planner/shared'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
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

  connectAppStore: projectProcedure.input(appStoreCredentialsInput).mutation(({ ctx, input }) =>
    ctx.services.integrations
      .connectAppStore(ctx.project.id, {
        issuerId: input.issuerId,
        keyId: input.keyId,
        privateKey: input.privateKey,
      })
      .catch(rethrow),
  ),

  connectGooglePlay: projectProcedure
    .input(googlePlayCredentialsInput)
    .mutation(({ ctx, input }) =>
      ctx.services.integrations
        .connectGooglePlay(ctx.project.id, { serviceAccountJson: input.serviceAccountJson })
        .catch(rethrow),
    ),

  connectTranslation: projectProcedure
    .input(z.object({ settings: translationSettingsInput }))
    .mutation(({ ctx, input }) =>
      ctx.services.integrations.connectTranslation(ctx.project.id, input.settings).catch(rethrow),
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
