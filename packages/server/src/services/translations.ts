import type { TranslateInput, TranslateResult } from '@planner/shared'
import { TranslationError } from '../translation'
import { IntegrationError, type integrationsService } from './integrations'

export function translationsService(deps: { integrations: ReturnType<typeof integrationsService> }) {
  return {
    async translate(projectId: string, input: TranslateInput): Promise<TranslateResult> {
      const translator = await deps.integrations.translatorFor(projectId)
      if (!translator) throw new IntegrationError('NOT_LINKED', 'Set up a translation provider in Integrations first')
      try {
        return await translator.translate({
          text: input.text,
          purpose: input.purpose,
          sourceLocale: input.sourceLocale,
          targetLocales: input.targetLocales.filter((l) => l !== input.sourceLocale),
        })
      } catch (e) {
        if (e instanceof TranslationError) throw new IntegrationError('VERIFICATION_FAILED', e.message)
        throw e
      }
    },
  }
}
