/**
 * App Store and Google Play name locales differently (Apple "ru" vs Google
 * "ru-RU", Apple "zh-Hans" vs Google "zh-CN"). These helpers find the best
 * counterpart for a locale among another store's locales.
 */
const ALIASES: Record<string, string[]> = {
  'zh-hans': ['zh-cn', 'zh-sg', 'zh'],
  'zh-hant': ['zh-tw', 'zh-hk', 'zh-mo'],
  'zh-cn': ['zh-hans', 'zh'],
  'zh-tw': ['zh-hant'],
  'zh-hk': ['zh-hant'],
  'es-mx': ['es-419', 'es-us'],
  'es-419': ['es-mx', 'es-us'],
  'es-us': ['es-419', 'es-mx'],
  'ar-sa': ['ar'],
  ar: ['ar-sa'],
}

const languageOf = (locale: string) => locale.toLowerCase().split('-')[0]!

/** Best matching candidate for `target`, or undefined when no candidate shares the language. */
export function matchLocale(target: string, candidates: readonly string[]): string | undefined {
  const lower = target.toLowerCase()
  const byLower = new Map(candidates.map((c) => [c.toLowerCase(), c]))
  if (byLower.has(lower)) return byLower.get(lower)
  for (const alias of ALIASES[lower] ?? []) {
    if (byLower.has(alias)) return byLower.get(alias)
  }
  const language = languageOf(target)
  const sameLanguage = candidates.filter((c) => languageOf(c) === language)
  if (sameLanguage.length === 0) return undefined
  // Prefer a region-less candidate, then the "default" region (ru → ru-RU), then the only/first one.
  return (
    sameLanguage.find((c) => !c.includes('-')) ??
    sameLanguage.find((c) => c.toLowerCase() === `${language}-${language}`) ??
    (sameLanguage.length === 1 ? sameLanguage[0] : undefined) ??
    sameLanguage[0]
  )
}
