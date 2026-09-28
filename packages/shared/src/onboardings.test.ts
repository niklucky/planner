import { describe, expect, it } from 'vitest'
import mock from './fixtures/capsule-intro.json'
import walletProfile from './fixtures/wallet-profile.json'
import { exportDraft, importStored } from './onboarding-json'
import {
  type AppProfile,
  appProfileSchema,
  buildRelease,
  contrastRatio,
  diffReleases,
  type MediaFile,
  missingWords,
  type OnboardingDraft,
  onboardingDocumentSchema,
  resolveOnboardingLocale,
  storedOnboardingSchema,
  writeWord,
} from './onboardings'

const profile: AppProfile = appProfileSchema.parse(walletProfile)

/** The bundled Wallet mock as a draft, the way an import creates it. */
function mockDraft(): OnboardingDraft {
  const imported = importStored(storedOnboardingSchema.parse(mock), profile)
  return {
    id: 'o1',
    projectId: 'p1',
    groupId: 'g1',
    key: imported.key,
    name: imported.name,
    defaultLocale: imported.defaultLocale,
    locales: imported.locales,
    defaultActions: imported.defaultActions,
    defaultLabels: imported.defaultLabels,
    pages: imported.pages.map((p, i) => ({ ...p, id: `page${i}`, media: [] })),
  }
}

describe('resolveOnboardingLocale', () => {
  const available = ['en', 'pt', 'zh', 'zh-Hant', 'de']
  it('follows exact, alias, language, default', () => {
    expect(resolveOnboardingLocale('pt-BR', available, 'en')).toBe('pt')
    expect(resolveOnboardingLocale('zh-Hans', available, 'en')).toBe('zh')
    expect(resolveOnboardingLocale('zh-Hant', available, 'en')).toBe('zh-Hant')
    expect(resolveOnboardingLocale('zh_hant', available, 'en')).toBe('zh-Hant')
    expect(resolveOnboardingLocale('zh-TW', available, 'en')).toBe('zh-Hant')
    expect(resolveOnboardingLocale('DE-at', available, 'en')).toBe('de')
    expect(resolveOnboardingLocale('ja', available, 'en')).toBe('en')
  })
})

describe('app profile', () => {
  it("accepts Wallet's profile", () => {
    expect(profile.actions).toContain('paywall')
    expect(profile.fields.find((f) => f.key === 'kicker')?.localized).toBe(true)
  })
  it('rejects duplicate keys and enums without options', () => {
    expect(appProfileSchema.safeParse({ ...walletProfile, actions: ['next', 'next'] }).success).toBe(false)
    expect(appProfileSchema.safeParse({ ...walletProfile, fields: [{ key: 'scene', type: 'enum' }] }).success).toBe(
      false,
    )
  })
})

describe('import and build', () => {
  it('imports the mock: 8 pages, 16 languages, localized fields per language', () => {
    const draft = mockDraft()
    expect(draft.pages).toHaveLength(8)
    expect(draft.locales).toHaveLength(16)
    expect(draft.defaultActions).toEqual(['next', 'skip'])
    const first = draft.pages[0]!
    expect(first.fields).toEqual({ 'kicker-audience': 'upgraded', scene: 'more-than-cards' })
    expect(first.copy.ru!.fields.kicker).toBe('Новое в Кошельке')
    expect(draft.pages[7]!.actions).toEqual(['paywall', 'skip'])
  })

  it('rebuilds exactly the documents the mock holds', () => {
    const draft = mockDraft()
    const build = buildRelease(draft, profile, new Map(), 1)
    expect(build.errors).toEqual([])
    expect(build.skipped).toEqual([])
    expect(Object.keys(build.documents)).toHaveLength(16)
    for (const [locale, content] of Object.entries(mock.locales)) {
      const doc = build.documents[locale]!
      expect(onboardingDocumentSchema.safeParse(doc).success).toBe(true)
      expect(doc).toEqual({ id: 'capsule-intro', version: 1, locale, ...content })
    }
  })

  it('leaves out a language with a hole, and blocks on a hole in the default', () => {
    const draft = mockDraft()
    const page = draft.pages[1]!
    page.copy.de = writeWord(page.copy.de, 'body', '')
    let build = buildRelease(draft, profile, new Map(), 1)
    expect(build.errors).toEqual([])
    expect(build.skipped.map((s) => s.locale)).toEqual(['de'])
    expect(build.documents.de).toBeUndefined()

    page.copy.en = writeWord(page.copy.en, 'title', ' ')
    build = buildRelease(draft, profile, new Map(), 1)
    expect(build.errors[0]).toMatch(/en \(the default language\) is missing: only-you-know · Title/)
  })

  it('requires a translated field once any language uses it', () => {
    const draft = mockDraft()
    const page = draft.pages[0]!
    page.copy.fr = writeWord(page.copy.fr, 'field:kicker', '')
    expect(missingWords(draft, profile, 'fr')).toEqual(['more-than-cards · kicker'])
    expect(missingWords(draft, profile, 'de')).toEqual([])
  })

  it('checks structure against the profile', () => {
    const draft = mockDraft()
    draft.pages[0]!.fields.scene = 'nope'
    draft.pages[1]!.colors[0]!.value = 'blue'
    draft.pages[2]!.actions = ['skip']
    draft.pages[3]!.platforms = ['web']
    draft.pages[4]!.fields.unknown = 'x'
    const { errors } = buildRelease(draft, profile, new Map(), 1)
    expect(errors).toEqual([
      expect.stringContaining('field "scene" must be one of'),
      expect.stringContaining('colour "accent" must be hex'),
      expect.stringContaining('Page unexpected: needs a main button'),
      expect.stringContaining('"web" is not a platform'),
      expect.stringContaining('field "unknown" is not a shared field'),
      // The new own button has no label yet.
      'en (the default language) is missing: unexpected · Button 1 · skip',
    ])
  })

  it('warns when the last page ends with next, and errors when a platform has no pages', () => {
    const draft = mockDraft()
    draft.pages = draft.pages.slice(0, 2)
    expect(buildRelease(draft, profile, new Map(), 1).warnings).toEqual([
      'The last page (only-you-know) ends with "next", which only closes the story',
    ])
    for (const p of draft.pages) p.platforms = ['ios']
    expect(buildRelease(draft, profile, new Map(), 1).errors).toEqual(['No page is left for android'])
  })

  it('turns media into files with a public path, and checks accepted types', () => {
    const draft = mockDraft()
    const file: MediaFile = {
      id: 'f1',
      sha256: 'abc',
      contentType: 'image/webp',
      width: 1200,
      height: 900,
      url: '/api/files/f1',
    }
    draft.pages[7]!.media = [{ key: 'illustration', fileId: 'f1' }]
    const build = buildRelease(draft, profile, new Map([['f1', file]]), 1)
    expect(build.documents.en!.pages[7]!.media).toEqual([
      { key: 'illustration', url: 'files/abc', mimeType: 'image/webp', width: 1200, height: 900 },
    ])
    expect(build.fileIds).toEqual(['f1'])

    draft.pages[7]!.media = [{ key: 'illustration-poster', fileId: 'f2' }]
    const video = { ...file, id: 'f2', contentType: 'video/mp4' }
    expect(buildRelease(draft, profile, new Map([['f2', video]]), 1).errors[0]).toMatch(/accepts image\/png/)
  })

  it('exports what it imports', () => {
    const draft = mockDraft()
    const exported = exportDraft(draft, new Map(), () => '', 1)
    const again = importStored(storedOnboardingSchema.parse(exported), profile)
    expect(again.pages).toEqual(importStored(storedOnboardingSchema.parse(mock), profile).pages)
  })
})

describe('diffReleases', () => {
  it('names changed pages per language, added languages and order changes', () => {
    const draft = mockDraft()
    const before = buildRelease(draft, profile, new Map(), 1).documents
    draft.pages[0]!.copy.de = writeWord(draft.pages[0]!.copy.de, 'title', 'Neu')
    draft.pages.reverse()
    const { de: _de, ...withoutDe } = before
    const after = buildRelease(draft, profile, new Map(), 1).documents
    const diff = diffReleases(withoutDe, after, 'en')
    expect(diff.addedLocales).toEqual(['de'])
    expect(diff.reordered).toBe(true)
    expect(diff.changedPages).toEqual([])
    expect(diffReleases(before, after, 'en').changedPages).toEqual([{ id: 'more-than-cards', locales: ['de'] }])
  })
})

describe('diffReleases after storage', () => {
  it('ignores object key order (jsonb reorders keys)', () => {
    const docs = buildRelease(mockDraft(), profile, new Map(), 1).documents
    const reordered = JSON.parse(JSON.stringify(docs), (_k, v) =>
      v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v,
    )
    const diff = diffReleases(reordered, docs, 'en')
    expect(diff.changedPages).toEqual([])
    expect(diff.defaultButtons).toEqual([])
  })
})

describe('contrastRatio', () => {
  it('matches WCAG', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21)
    expect(contrastRatio('#121625', '#C4DEFC')!).toBeGreaterThan(4.5)
    expect(contrastRatio('red', '#fff')).toBeNull()
  })
})
