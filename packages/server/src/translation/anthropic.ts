import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { TranslateInput, TranslateResult } from '@planner/shared'
import { z } from 'zod'
import type { Translator } from './index'
import { TranslationError } from './index'
import { systemPrompt, userPrompt } from './prompt'

const outputSchema = z.object({
  translations: z.array(z.object({ locale: z.string(), text: z.string() })),
})

export function createAnthropicTranslator(apiKey: string, model: string): Translator {
  const client = new Anthropic({ apiKey })

  async function call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new TranslationError('Anthropic rejected the API key')
      if (e instanceof Anthropic.RateLimitError)
        throw new TranslationError('Anthropic rate limit reached, try again shortly')
      if (e instanceof Anthropic.APIError) throw new TranslationError(`Anthropic error ${e.status}: ${e.message}`)
      throw e
    }
  }

  return {
    async verify() {
      await call(() => client.models.retrieve(model))
    },

    async translate(input: TranslateInput): Promise<TranslateResult> {
      const response = await call(() =>
        client.messages.parse({
          model,
          max_tokens: 16000,
          system: systemPrompt(input.purpose),
          messages: [{ role: 'user', content: userPrompt(input) }],
          output_config: { format: zodOutputFormat(outputSchema) },
        }),
      )
      if (response.stop_reason === 'refusal') {
        throw new TranslationError(
          `The model declined to translate this text${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ''}`,
        )
      }
      const parsed = response.parsed_output
      if (!parsed) throw new TranslationError('The model returned an unreadable answer')
      const wanted = new Set(input.targetLocales)
      const translations = parsed.translations.filter((t) => wanted.has(t.locale) && t.text.trim())
      const got = new Set(translations.map((t) => t.locale))
      return { translations, unsupported: input.targetLocales.filter((l) => !got.has(l)) }
    },
  }
}
