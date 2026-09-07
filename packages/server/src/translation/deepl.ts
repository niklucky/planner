import type { TranslateInput, TranslateResult } from '@planner/shared'
import type { Translator } from './index'
import { TranslationError } from './index'

const TARGETS = new Set([
  'AR', 'BG', 'CS', 'DA', 'DE', 'EL', 'EN-GB', 'EN-US', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV',
  'NB', 'NL', 'PL', 'PT-BR', 'PT-PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH-HANS', 'ZH-HANT',
])
const BRITISH = new Set(['gb', 'au', 'nz', 'ie', 'in', 'za'])

/** Store locale → DeepL target code, or null when DeepL doesn't support the language. */
export function deeplTarget(locale: string): string | null {
  const [lang = '', region = ''] = locale.split('-').map((p) => p.toLowerCase())
  if (lang === 'en') return BRITISH.has(region) ? 'EN-GB' : 'EN-US'
  if (lang === 'pt') return region === 'pt' ? 'PT-PT' : 'PT-BR'
  if (lang === 'zh') return ['tw', 'hk', 'mo', 'hant'].includes(region) ? 'ZH-HANT' : 'ZH-HANS'
  if (lang === 'no' || lang === 'nb') return 'NB'
  const code = lang.toUpperCase()
  return TARGETS.has(code) ? code : null
}

export function deeplSource(locale: string) {
  const lang = locale.split('-')[0]!.toUpperCase()
  return lang === 'NO' ? 'NB' : lang
}

export function createDeepLTranslator(apiKey: string, plan: 'free' | 'pro'): Translator {
  const base = plan === 'pro' ? 'https://api.deepl.com/v2' : 'https://api-free.deepl.com/v2'

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { authorization: `DeepL-Auth-Key ${apiKey}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    })
    const text = await res.text()
    if (!res.ok) {
      let detail = `DeepL responded ${res.status}`
      try {
        const body = JSON.parse(text) as { message?: string }
        if (body.message) detail = `DeepL: ${body.message}`
      } catch {}
      if (res.status === 403) detail = 'DeepL rejected the API key (check the Free/Pro plan too)'
      throw new TranslationError(detail)
    }
    return JSON.parse(text) as T
  }

  return {
    async verify() {
      await request('/usage')
    },

    async translate(input: TranslateInput): Promise<TranslateResult> {
      const translations: TranslateResult['translations'] = []
      const unsupported: string[] = []
      for (const locale of input.targetLocales) {
        const target = deeplTarget(locale)
        if (!target) {
          unsupported.push(locale)
          continue
        }
        const res = await request<{ translations?: Array<{ text: string }> }>('/translate', {
          method: 'POST',
          body: JSON.stringify({
            text: [input.text],
            source_lang: deeplSource(input.sourceLocale),
            target_lang: target,
            preserve_formatting: true,
          }),
        })
        const text = res.translations?.[0]?.text
        if (text) translations.push({ locale, text })
        else unsupported.push(locale)
      }
      return { translations, unsupported }
    },
  }
}
