import { z } from 'zod'

/** LLMs we support for translation. `id` is `<vendor>/<model>`. */
export const TRANSLATION_MODELS = [
  { id: 'anthropic/claude-opus-5', label: 'Anthropic Opus' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek' },
] as const
export type TranslationModelId = (typeof TRANSLATION_MODELS)[number]['id']
const modelIds = TRANSLATION_MODELS.map((m) => m.id) as [TranslationModelId, ...TranslationModelId[]]

export const translationSettingsInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('llm'),
    model: z.enum(modelIds),
    apiKey: z.string().trim().min(1, 'Enter the API key'),
  }),
  z.object({
    kind: z.literal('deepl'),
    plan: z.enum(['free', 'pro']).default('free'),
    apiKey: z.string().trim().min(1, 'Enter the API key'),
  }),
])
export type TranslationSettings = z.infer<typeof translationSettingsInput>

export function translationLabel(settings: { kind: string; model?: string; plan?: string }) {
  if (settings.kind === 'deepl') return `DeepL (${settings.plan === 'pro' ? 'Pro' : 'Free'})`
  return TRANSLATION_MODELS.find((m) => m.id === settings.model)?.label ?? settings.model ?? 'LLM'
}

/** What the text is, so the model keeps the right register and length. */
export const TRANSLATION_PURPOSES = ['release-notes', 'onboarding'] as const
export type TranslationPurpose = (typeof TRANSLATION_PURPOSES)[number]

export const translateInput = z.object({
  text: z.string().min(1).max(4000),
  purpose: z.enum(TRANSLATION_PURPOSES).default('release-notes'),
  sourceLocale: z.string().min(2).max(20),
  targetLocales: z.array(z.string().min(2).max(20)).min(1).max(50),
})
export type TranslateInput = z.infer<typeof translateInput>

export interface TranslateResult {
  translations: Array<{ locale: string; text: string }>
  /** Target locales the provider cannot translate into. */
  unsupported: string[]
}
