import { IntegrationError, type IntegrationErrorCode } from '@planner/server'
import { translateInput } from '@planner/shared'
import { TRPCError } from '@trpc/server'
import { projectProcedure, router } from '../trpc'

const codes: Record<IntegrationErrorCode, TRPCError['code']> = {
  NOT_FOUND: 'NOT_FOUND',
  VERIFICATION_FAILED: 'BAD_REQUEST',
  ALREADY_IMPORTED: 'CONFLICT',
  NOT_LINKED: 'PRECONDITION_FAILED',
}

export const translationsRouter = router({
  translate: projectProcedure.input(translateInput).mutation(({ ctx, input }) =>
    ctx.services.translations
      .translate(ctx.project.id, { text: input.text, sourceLocale: input.sourceLocale, targetLocales: input.targetLocales })
      .catch((e: unknown) => {
        if (e instanceof IntegrationError) throw new TRPCError({ code: codes[e.code], message: e.message, cause: e })
        throw e
      }),
  ),
})
