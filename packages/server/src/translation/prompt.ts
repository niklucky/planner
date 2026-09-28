import { RELEASE_NOTE_MAX_LENGTH, type TranslateInput, type TranslationPurpose } from '@planner/shared'

const RELEASE_NOTES_PROMPT = `You translate "What's New" release notes for mobile apps published on the App Store and Google Play.

Rules:
- Preserve line breaks, bullet characters and emoji exactly as in the source.
- Keep product, feature and brand names unchanged unless a translation is conventional in the target language.
- Keep the register of the source (concise, friendly, user-facing).
- Each translation must stay under ${RELEASE_NOTE_MAX_LENGTH} characters.
- Target locales are the BCP-47 codes used by the stores (for example "de-DE", "zh-Hans", "pt-BR"); write natural text for that region.
- Return one translation per requested target locale, nothing else.`

const ONBOARDING_PROMPT = `You translate the copy of an in-app onboarding: the short pages a mobile app shows to introduce a feature. A text is one of a page title, a page body, a button label, or a small line such as a kicker above the title or a note above the buttons.

Rules:
- Preserve line breaks exactly: in titles they are deliberate breaks.
- Keep product, feature and brand names unchanged unless a translation is conventional in the target language.
- Keep the register and length of the source: titles stay short, button labels stay a few words, written as an action.
- Target locales are BCP-47 codes (for example "de", "pt", "zh", "zh-Hant"); write natural text for that language.
- Return one translation per requested target locale, nothing else.`

export function systemPrompt(purpose: TranslationPurpose = 'release-notes') {
  return purpose === 'onboarding' ? ONBOARDING_PROMPT : RELEASE_NOTES_PROMPT
}

export function userPrompt(input: TranslateInput) {
  return `Source locale: ${input.sourceLocale}
Target locales: ${input.targetLocales.join(', ')}

Source text:
<<<
${input.text}
>>>`
}
