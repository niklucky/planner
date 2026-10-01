import { OnboardingError, type OnboardingErrorCode } from '@planner/server'
import {
  apiKeyIdInput,
  appGroupIdInput,
  createApiKeyInput,
  createOnboardingInput,
  deployReleaseInput,
  importOnboardingInput,
  onboardingEnvironmentInput,
  onboardingIdInput,
  pageIdInput,
  publishOnboardingInput,
  reorderPagesInput,
  saveAppProfileInput,
  saveCopyInput,
  savePageInput,
  updateOnboardingInput,
} from '@planner/shared'
import { TRPCError } from '@trpc/server'
import { type Context, projectProcedure, router } from '../trpc'

const codes: Record<OnboardingErrorCode, TRPCError['code']> = {
  NOT_FOUND: 'NOT_FOUND',
  INVALID: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',
}

function rethrow(e: unknown): never {
  if (e instanceof OnboardingError) throw new TRPCError({ code: codes[e.code], message: e.message, cause: e })
  throw e
}

function requireOwner(ctx: Context & { project: { role: string } }) {
  if (ctx.project.role !== 'owner')
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the project owner can manage API keys' })
}

export const onboardingsRouter = router({
  list: projectProcedure.query(({ ctx }) => ctx.services.onboardings.list(ctx.project.id)),

  get: projectProcedure
    .input(onboardingIdInput)
    .query(({ ctx, input }) => ctx.services.onboardings.get(ctx.project.id, input.onboardingId).catch(rethrow)),

  create: projectProcedure.input(createOnboardingInput).mutation(({ ctx, input }) =>
    ctx.services.onboardings
      .create(ctx.project.id, {
        groupId: input.groupId,
        key: input.key,
        name: input.name,
        defaultLocale: input.defaultLocale,
      })
      .catch(rethrow),
  ),

  update: projectProcedure.input(updateOnboardingInput).mutation(({ ctx, input }) =>
    ctx.services.onboardings
      .update(ctx.project.id, {
        onboardingId: input.onboardingId,
        key: input.key,
        name: input.name,
        defaultLocale: input.defaultLocale,
        locales: input.locales,
        defaultActions: input.defaultActions,
      })
      .catch(rethrow),
  ),

  remove: projectProcedure
    .input(onboardingIdInput)
    .mutation(({ ctx, input }) => ctx.services.onboardings.remove(ctx.project.id, input.onboardingId).catch(rethrow)),

  savePage: projectProcedure.input(savePageInput).mutation(({ ctx, input }) =>
    ctx.services.onboardings
      .savePage(ctx.project.id, {
        onboardingId: input.onboardingId,
        pageId: input.pageId,
        key: input.key,
        actions: input.actions,
        platforms: input.platforms,
        fields: input.fields,
        colors: input.colors,
        media: input.media,
      })
      .catch(rethrow),
  ),

  removePage: projectProcedure
    .input(pageIdInput)
    .mutation(({ ctx, input }) => ctx.services.onboardings.removePage(ctx.project.id, input.pageId).catch(rethrow)),

  reorderPages: projectProcedure
    .input(reorderPagesInput)
    .mutation(({ ctx, input }) =>
      ctx.services.onboardings.reorderPages(ctx.project.id, input.onboardingId, input.ids).catch(rethrow),
    ),

  saveCopy: projectProcedure.input(saveCopyInput).mutation(({ ctx, input }) =>
    ctx.services.onboardings
      .saveCopy(ctx.project.id, {
        onboardingId: input.onboardingId,
        pages: input.pages,
        defaultLabels: input.defaultLabels,
      })
      .catch(rethrow),
  ),

  importJson: projectProcedure
    .input(importOnboardingInput)
    .mutation(({ ctx, input }) =>
      ctx.services.onboardings.importJson(ctx.project.id, input.groupId, input.json).catch(rethrow),
    ),

  exportJson: projectProcedure
    .input(onboardingIdInput)
    .query(({ ctx, input }) =>
      ctx.services.onboardings.exportJson(ctx.project.id, input.onboardingId, ctx.publicUrl).catch(rethrow),
    ),

  previewPublish: projectProcedure
    .input(publishOnboardingInput)
    .query(({ ctx, input }) =>
      ctx.services.onboardings
        .previewPublish(ctx.project.id, input.onboardingId, input.offerAgain, input.environmentId)
        .catch(rethrow),
    ),

  publish: projectProcedure
    .input(publishOnboardingInput)
    .mutation(({ ctx, input }) =>
      ctx.services.onboardings
        .publish(ctx.project.id, input.onboardingId, input.offerAgain, input.environmentId, ctx.user.id)
        .catch(rethrow),
    ),

  previewDeploy: projectProcedure
    .input(deployReleaseInput)
    .query(({ ctx, input }) =>
      ctx.services.onboardings
        .previewDeploy(ctx.project.id, input.onboardingId, input.environmentId, input.releaseId)
        .catch(rethrow),
    ),

  deploy: projectProcedure
    .input(deployReleaseInput)
    .mutation(({ ctx, input }) =>
      ctx.services.onboardings
        .deploy(ctx.project.id, input.onboardingId, input.environmentId, input.releaseId, ctx.user.id)
        .catch(rethrow),
    ),

  followProduction: projectProcedure
    .input(onboardingEnvironmentInput)
    .mutation(({ ctx, input }) =>
      ctx.services.onboardings.followProduction(ctx.project.id, input.onboardingId, input.environmentId).catch(rethrow),
    ),

  releases: projectProcedure
    .input(onboardingIdInput)
    .query(({ ctx, input }) => ctx.services.onboardings.releases(ctx.project.id, input.onboardingId).catch(rethrow)),

  profile: projectProcedure
    .input(appGroupIdInput)
    .query(({ ctx, input }) => ctx.services.onboardings.getProfile(ctx.project.id, input.groupId).catch(rethrow)),

  saveProfile: projectProcedure
    .input(saveAppProfileInput)
    .mutation(({ ctx, input }) =>
      ctx.services.onboardings.saveProfile(ctx.project.id, input.groupId, input.json).catch(rethrow),
    ),

  /** Where the public API answers when reached directly (not through an app's proxy). */
  publicUrl: projectProcedure.query(({ ctx }) => ctx.publicUrl),

  apiKeys: projectProcedure.query(({ ctx }) => ctx.services.onboardings.listApiKeys(ctx.project.id)),

  createApiKey: projectProcedure.input(createApiKeyInput).mutation(({ ctx, input }) => {
    requireOwner(ctx)
    return ctx.services.onboardings
      .createApiKey(ctx.project.id, ctx.user.id, input.name, input.environmentId)
      .catch(rethrow)
  }),

  revokeApiKey: projectProcedure.input(apiKeyIdInput).mutation(({ ctx, input }) => {
    requireOwner(ctx)
    return ctx.services.onboardings.revokeApiKey(ctx.project.id, input.apiKeyId).catch(rethrow)
  }),
})
