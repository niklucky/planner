import { IntegrationError, type IntegrationErrorCode } from '@planner/server'
import {
  appIdInput,
  importAppInput,
  importGooglePlayAppInput,
  moveAppToGroupInput,
  renameAppGroupInput,
} from '@planner/shared'
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

export const appsRouter = router({
  list: projectProcedure.query(({ ctx }) => ctx.services.apps.listForProject(ctx.project.id)),

  importFromStore: projectProcedure
    .input(importAppInput)
    .mutation(({ ctx, input }) =>
      ctx.services.integrations
        .importApp(ctx.project.id, { integrationId: input.integrationId, externalId: input.externalId })
        .catch(rethrow),
    ),

  importFromGooglePlay: projectProcedure
    .input(importGooglePlayAppInput)
    .mutation(({ ctx, input }) =>
      ctx.services.integrations
        .importGooglePlayApp(ctx.project.id, { integrationId: input.integrationId, packageName: input.packageName })
        .catch(rethrow),
    ),

  groups: projectProcedure.query(({ ctx }) => ctx.services.apps.listGroups(ctx.project.id)),

  moveToGroup: projectProcedure
    .input(moveAppToGroupInput)
    .mutation(({ ctx, input }) =>
      ctx.services.apps.moveToGroup(ctx.project.id, { appId: input.appId, groupId: input.groupId }).catch(rethrow),
    ),

  renameGroup: projectProcedure
    .input(renameAppGroupInput)
    .mutation(({ ctx, input }) =>
      ctx.services.apps.renameGroup(ctx.project.id, input.groupId, input.name).catch(rethrow),
    ),

  versions: projectProcedure.query(({ ctx }) => ctx.services.apps.listVersionsForProject(ctx.project.id)),

  syncVersions: projectProcedure
    .input(appIdInput)
    .mutation(({ ctx, input }) => ctx.services.integrations.syncVersions(ctx.project.id, input.appId).catch(rethrow)),
})
