import { RELEASE_NOTE_MAX_LENGTH, type TranslateInput } from '@planner/shared'

export const SYSTEM_PROMPT = `You translate "What's New" release notes for mobile apps published on the App Store and Google Play.

Rules:
- Preserve line breaks, bullet characters and emoji exactly as in the source.
- Keep product, feature and brand names unchanged unless a translation is conventional in the target language.
- Keep the register of the source (concise, friendly, user-facing).
- Each translation must stay under ${RELEASE_NOTE_MAX_LENGTH} characters.
- Target locales are the BCP-47 codes used by the stores (for example "de-DE", "zh-Hans", "pt-BR"); write natural text for that region.
- Return one translation per requested target locale, nothing else.`

export function userPrompt(input: TranslateInput) {
  return `Source locale: ${input.sourceLocale}
Target locales: ${input.targetLocales.join(', ')}

Source text:
<<<
${input.text}
>>>`
}
