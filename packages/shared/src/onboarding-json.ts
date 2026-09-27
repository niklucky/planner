import {
  type AppProfile,
  type DefaultLabels,
  type DraftPage,
  draftLocales,
  emptyCopy,
  type FieldValue,
  type MediaFile,
  type OnboardingDraft,
  type PageCopy,
  type StoredOnboarding,
} from './onboardings'

/**
 * Import and export in the contract's all-languages form, the shape of Wallet's
 * bundled mock: `{ id, version, defaultLocale, locales: { en: { actions, pages } } }`.
 * The default language decides the structure (pages, buttons, shared fields,
 * colours, media); every language contributes its words.
 */

export interface ImportedPage extends Omit<DraftPage, 'id' | 'media'> {
  /** Files are matched by hash; entries without a known file are dropped with a warning. */
  media: Array<{ key: string; sha256: string }>
}

export interface ImportedOnboarding {
  key: string
  name: string
  defaultLocale: string
  locales: string[]
  defaultActions: string[]
  defaultLabels: Record<string, DefaultLabels>
  pages: ImportedPage[]
  warnings: string[]
}

export function importStored(stored: StoredOnboarding, profile: AppProfile): ImportedOnboarding {
  const warnings: string[] = []
  const localized = new Set(profile.fields.filter((f) => f.localized).map((f) => f.key))
  const base = stored.locales[stored.defaultLocale]!
  const defaultActions = (base.actions ?? []).map((a) => a.action)
  const locales = [stored.defaultLocale, ...Object.keys(stored.locales).filter((l) => l !== stored.defaultLocale)]

  const pages: ImportedPage[] = base.pages.map((p) => {
    const fields: Record<string, FieldValue> = {}
    for (const [key, value] of Object.entries(p.fields ?? {})) if (!localized.has(key)) fields[key] = value
    const media: ImportedPage['media'] = []
    for (const m of p.media ?? []) {
      if (m.sha256) media.push({ key: m.key, sha256: m.sha256 })
      else warnings.push(`Page ${p.id}: media "${m.key}" was not imported; upload the file in the page editor`)
    }
    return {
      key: p.id,
      actions: p.actions ? p.actions.map((a) => a.action) : null,
      platforms: p.when?.platforms ?? [],
      fields,
      colors: (p.colors ?? []).map((c) => ({ key: c.key, value: c.value })),
      media,
      copy: {},
    }
  })

  const defaultLabels: Record<string, DefaultLabels> = {}
  for (const locale of locales) {
    const content = stored.locales[locale]!
    const labels = defaultActions.map((action, i) => {
      const entry = content.actions?.[i]
      if (entry && entry.action !== action)
        warnings.push(`${locale}: default button ${i + 1} is "${entry.action}", expected "${action}"; kept its label`)
      return entry?.label ?? ''
    })
    if (defaultActions.length > 0) defaultLabels[locale] = { labels, machine: [] }

    for (const p of content.pages) {
      const page = pages.find((x) => x.key === p.id)
      if (!page) {
        warnings.push(`${locale}: page ${p.id} is not in ${stored.defaultLocale} and was skipped`)
        continue
      }
      const copy: PageCopy = emptyCopy()
      copy.title = p.title ?? ''
      copy.body = p.body ?? ''
      copy.actionLabels = (page.actions ?? []).map((_, i) => p.actions?.[i]?.label ?? '')
      for (const [key, value] of Object.entries(p.fields ?? {})) {
        if (localized.has(key) && typeof value === 'string') copy.fields[key] = value
        else if (!localized.has(key) && JSON.stringify(page.fields[key]) !== JSON.stringify(value))
          warnings.push(
            `${locale}: page ${p.id} sets "${key}" differently from ${stored.defaultLocale}; kept the default`,
          )
      }
      page.copy[locale] = copy
    }
  }

  return {
    key: stored.id,
    name: stored.name ?? stored.id,
    defaultLocale: stored.defaultLocale,
    locales,
    defaultActions,
    defaultLabels,
    pages,
    warnings,
  }
}

/** The draft in all-languages form, words as they stand (blank ones included). */
export function exportDraft(
  draft: OnboardingDraft,
  files: ReadonlyMap<string, MediaFile>,
  mediaUrl: (file: MediaFile) => string,
  version: number,
) {
  const locales: Record<string, unknown> = {}
  for (const locale of draftLocales(draft)) {
    const labels = draft.defaultLabels[locale]?.labels ?? []
    locales[locale] = {
      ...(draft.defaultActions.length > 0 && {
        actions: draft.defaultActions.map((action, i) => ({ action, label: labels[i] ?? '' })),
      }),
      pages: draft.pages.map((page) => {
        const copy = page.copy[locale] ?? emptyCopy()
        const fields: Record<string, FieldValue> = { ...page.fields, ...copy.fields }
        return {
          id: page.key,
          title: copy.title,
          body: copy.body,
          ...(page.platforms.length > 0 && { when: { platforms: page.platforms } }),
          ...(page.actions && {
            actions: page.actions.map((action, i) => ({ action, label: copy.actionLabels[i] ?? '' })),
          }),
          ...(Object.keys(fields).length > 0 && { fields }),
          ...(page.colors.length > 0 && { colors: page.colors }),
          ...(page.media.length > 0 && {
            media: page.media.flatMap((m) => {
              const file = files.get(m.fileId)
              return file
                ? [
                    {
                      key: m.key,
                      url: mediaUrl(file),
                      mimeType: file.contentType,
                      width: file.width,
                      height: file.height,
                      sha256: file.sha256,
                    },
                  ]
                : []
            }),
          }),
        }
      }),
    }
  }
  return { id: draft.key, version, name: draft.name, defaultLocale: draft.defaultLocale, locales }
}
