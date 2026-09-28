import type { TranslateInput, TranslateResult } from '@planner/shared'
import type { Translator } from './index'
import { TranslationError } from './index'
import { systemPrompt, userPrompt } from './prompt'

const BASE_URL = 'https://api.deepseek.com'

/** DeepSeek exposes an OpenAI-style chat completions API. */
export function createDeepSeekTranslator(apiKey: string, model: string): Translator {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    })
    const text = await res.text()
    if (!res.ok) {
      let detail = `DeepSeek responded ${res.status}`
      try {
        const body = JSON.parse(text) as { error?: { message?: string } }
        if (body.error?.message) detail = `DeepSeek: ${body.error.message}`
      } catch {}
      throw new TranslationError(detail)
    }
    return JSON.parse(text) as T
  }

  return {
    async verify() {
      const res = await request<{ data?: Array<{ id: string }> }>('/models')
      if (!res.data?.some((m) => m.id === model))
        throw new TranslationError(`Model ${model} is not available for this key`)
    },

    async translate(input: TranslateInput): Promise<TranslateResult> {
      const res = await request<{ choices?: Array<{ message?: { content?: string } }> }>('/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `${systemPrompt(input.purpose)}\n\nRespond with JSON only: {"translations":[{"locale":"<target locale>","text":"<translation>"}]}`,
            },
            { role: 'user', content: userPrompt(input) },
          ],
        }),
      })
      const content = res.choices?.[0]?.message?.content
      if (!content) throw new TranslationError('DeepSeek returned an empty answer')
      let parsed: { translations?: Array<{ locale?: string; text?: string }> }
      try {
        parsed = JSON.parse(content)
      } catch {
        throw new TranslationError('DeepSeek returned an unreadable answer')
      }
      const wanted = new Set(input.targetLocales)
      const translations = (parsed.translations ?? [])
        .filter((t): t is { locale: string; text: string } => !!t.locale && !!t.text?.trim() && wanted.has(t.locale))
        .map((t) => ({ locale: t.locale, text: t.text }))
      const got = new Set(translations.map((t) => t.locale))
      return { translations, unsupported: input.targetLocales.filter((l) => !got.has(l)) }
    },
  }
}
