import type { TranslateInput, TranslateResult, TranslationSettings } from '@planner/shared'
import { createAnthropicTranslator } from './anthropic'
import { createDeepLTranslator } from './deepl'
import { createDeepSeekTranslator } from './deepseek'

export interface Translator {
  /** Checks the credentials with a cheap request. */
  verify(): Promise<void>
  translate(input: TranslateInput): Promise<TranslateResult>
}

export class TranslationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranslationError'
  }
}

export function createTranslator(settings: TranslationSettings): Translator {
  if (settings.kind === 'deepl') return createDeepLTranslator(settings.apiKey, settings.plan)
  const [vendor, model] = settings.model.split('/') as [string, string]
  if (vendor === 'anthropic') return createAnthropicTranslator(settings.apiKey, model)
  if (vendor === 'deepseek') return createDeepSeekTranslator(settings.apiKey, model)
  throw new TranslationError(`Unsupported model ${settings.model}`)
}
