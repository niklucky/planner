import { z } from 'zod'
import { LOCALE_ALIASES } from './locales'

/**
 * Onboardings: short stories of pages an app shows (at launch, on a tab). Planner
 * edits a draft, freezes it into a release on publish, and serves one language of
 * the latest release to the app. The wire shape is the app's contract; Wallet's
 * parser is `apps/mobile/src/features/onboarding/document.ts` in its repo.
 */

// ── App profile ─────────────────────────────────────────────────────────────

/** Keys of actions, platforms, fields, colours and media: `kicker`, `background-from`. */
const vocabularyKey = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Keys use letters, digits, - and _')
  .max(64)

export const PROFILE_FIELD_TYPES = ['text', 'enum', 'number', 'boolean'] as const
export type ProfileFieldType = (typeof PROFILE_FIELD_TYPES)[number]

const profileFieldSchema = z
  .object({
    key: vocabularyKey,
    type: z.enum(PROFILE_FIELD_TYPES),
    /** Translated per language (text fields only). */
    localized: z.boolean().optional(),
    options: z.array(z.string().min(1)).optional(),
    description: z.string().optional(),
  })
  .refine((f) => f.type !== 'enum' || (f.options?.length ?? 0) > 0, 'An enum field needs options')
  .refine((f) => !f.localized || f.type === 'text', 'Only text fields can be localized')

/**
 * What an app understands: the vocabulary its onboarding pages may use. Each app
 * ships it in its repo (Wallet: `apps/mobile/src/features/onboarding/profile.json`)
 * and Planner imports it per app group.
 */
export const appProfileSchema = z
  .object({
    app: z.string().trim().min(1).max(64),
    actions: z.array(vocabularyKey).min(1),
    platforms: z.array(vocabularyKey).min(1),
    fields: z.array(profileFieldSchema).default([]),
    colors: z.array(z.object({ key: vocabularyKey, description: z.string().optional() })).default([]),
    media: z
      .array(
        z.object({
          key: vocabularyKey,
          accept: z.array(z.string().trim().toLowerCase().min(1)).min(1),
          description: z.string().optional(),
        }),
      )
      .default([]),
  })
  .superRefine((p, ctx) => {
    const lists = { actions: p.actions, platforms: p.platforms } as Record<string, string[]>
    lists.fields = p.fields.map((f) => f.key)
    lists.colors = p.colors.map((c) => c.key)
    lists.media = p.media.map((m) => m.key)
    for (const [name, keys] of Object.entries(lists)) {
      const dupe = keys.find((k, i) => keys.indexOf(k) !== i)
      if (dupe) ctx.addIssue({ code: 'custom', path: [name], message: `${name}: "${dupe}" is listed twice` })
    }
  })
export type AppProfile = z.output<typeof appProfileSchema>
export type ProfileField = AppProfile['fields'][number]

/** Parses a profile.json text, with a readable message for the first problem. */
export function parseAppProfile(json: string): { profile: AppProfile } | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { error: 'Not valid JSON' }
  }
  const result = appProfileSchema.safeParse(raw)
  if (result.success) return { profile: result.data }
  const issue = result.error.issues[0]!
  return { error: issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message }
}

// ── The contract (one language per response) ────────────────────────────────

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
export const isHexColor = (value: string) => HEX_COLOR.test(value)

/** The app drops blank strings, so the contract never carries them. */
const words = z.string().refine((s) => s.trim() !== '', 'Required')

export const onboardingActionSchema = z.object({ action: z.string().min(1), label: words })
export type OnboardingAction = z.infer<typeof onboardingActionSchema>

export const onboardingMediaSchema = z.object({
  key: z.string().min(1),
  url: z.string().min(1),
  mimeType: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
export type OnboardingMedia = z.infer<typeof onboardingMediaSchema>

export const onboardingPageSchema = z.object({
  id: words,
  title: words,
  body: words,
  when: z.object({ platforms: z.array(z.string().min(1)).min(1) }).optional(),
  actions: z.array(onboardingActionSchema).min(1).optional(),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  colors: z.array(z.object({ key: z.string().min(1), value: z.string().regex(HEX_COLOR) })).optional(),
  media: z.array(onboardingMediaSchema).optional(),
})
export type OnboardingPageDocument = z.infer<typeof onboardingPageSchema>

/** What `GET /public/v1/onboardings/{key}?locale=` answers with. */
export const onboardingDocumentSchema = z
  .object({
    id: words,
    version: z.number().int().min(1),
    locale: words,
    actions: z.array(onboardingActionSchema).min(1).optional(),
    pages: z.array(onboardingPageSchema).min(1),
  })
  .superRefine((doc, ctx) => {
    doc.pages.forEach((page, i) => {
      const actions = page.actions ?? doc.actions ?? []
      if (!actions.some((a) => a.action !== 'skip')) {
        ctx.addIssue({ code: 'custom', path: ['pages', i, 'actions'], message: 'Page has no main button' })
      }
    })
  })
export type OnboardingDocument = z.infer<typeof onboardingDocumentSchema>

/** Media URLs are stored relative to the public API root and made absolute when served. */
export const mediaPath = (sha256: string) => `files/${sha256}`

/**
 * Which language answers a request: exact (case-insensitive, `_` read as `-`), then
 * the store-locale aliases, then the language before the first hyphen, then the
 * default. `pt-BR` finds `pt`, `zh-Hans` finds `zh`, `zh-Hant` finds itself.
 */
export function resolveOnboardingLocale(requested: string, available: readonly string[], fallback: string): string {
  const normalize = (code: string) => code.toLowerCase().replaceAll('_', '-')
  const byNormalized = new Map(available.map((code) => [normalize(code), code]))
  const wanted = normalize(requested)
  const exact = byNormalized.get(wanted)
  if (exact) return exact
  for (const alias of LOCALE_ALIASES[wanted] ?? []) {
    const hit = byNormalized.get(alias)
    if (hit) return hit
  }
  return byNormalized.get(wanted.split('-')[0]!) ?? fallback
}

// ── Import / export: the all-languages form (Wallet's bundled mock) ─────────

const looseMedia = z.object({
  key: z.string().min(1),
  url: z.string().optional(),
  mimeType: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  /** Planner's export adds the file hash so a re-import can re-attach the file. */
  sha256: z.string().optional(),
})

const looseLocale = z.object({
  actions: z.array(z.object({ action: z.string().min(1), label: z.string() })).optional(),
  pages: z.array(
    z.object({
      id: z.string().trim().min(1),
      title: z.string().optional(),
      body: z.string().optional(),
      when: z.object({ platforms: z.array(z.string()) }).optional(),
      actions: z.array(z.object({ action: z.string().min(1), label: z.string() })).optional(),
      fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      colors: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
      media: z.array(looseMedia).optional(),
    }),
  ),
})

/** `{ id, version, defaultLocale, locales: { en: { actions, pages }, … } }` */
export const storedOnboardingSchema = z
  .object({
    id: z.string().trim().min(1),
    version: z.number().int().min(1).optional(),
    name: z.string().optional(),
    defaultLocale: z.string().trim().min(1),
    locales: z.record(z.string(), looseLocale),
  })
  .refine((o) => o.defaultLocale in o.locales, 'defaultLocale must be one of locales')
export type StoredOnboarding = z.infer<typeof storedOnboardingSchema>

// ── Draft (what the editor edits) ───────────────────────────────────────────

export type FieldValue = string | number | boolean

/** Words of one page in one language. `machine` lists word ids still unreviewed machine output. */
export interface PageCopy {
  title: string
  body: string
  /** One per action of the page's own list, in order. */
  actionLabels: string[]
  /** Localized fields only (e.g. kicker, note). */
  fields: Record<string, string>
  machine: string[]
}

export interface DefaultLabels {
  /** One per default action, in order. */
  labels: string[]
  machine: string[]
}

export interface DraftPage {
  id: string
  key: string
  /** The page's own buttons; null uses the onboarding's default actions. */
  actions: string[] | null
  /** Empty means every platform. */
  platforms: string[]
  /** Shared (not localized) field values, e.g. scene. */
  fields: Record<string, FieldValue>
  colors: Array<{ key: string; value: string }>
  media: Array<{ key: string; fileId: string }>
  copy: Record<string, PageCopy>
}

export interface OnboardingDraft {
  id: string
  projectId: string
  groupId: string
  key: string
  name: string
  defaultLocale: string
  locales: string[]
  defaultActions: string[]
  defaultLabels: Record<string, DefaultLabels>
  pages: DraftPage[]
}

/** A stored file as the editor and the release builder see it. */
export interface MediaFile {
  id: string
  sha256: string
  contentType: string
  width: number | null
  height: number | null
  /** Member-only URL for previews in the editor. */
  url: string
}

export const emptyCopy = (): PageCopy => ({ title: '', body: '', actionLabels: [], fields: {}, machine: [] })

/**
 * Word ids: `title`, `body`, `label:<index>` (a button of the page's own list, or of
 * the default list for the onboarding's default labels) and `field:<key>`.
 */
export interface WordField {
  id: string
  label: string
}

export function pageWordFields(page: Pick<DraftPage, 'actions'>, profile: AppProfile | null): WordField[] {
  const fields: WordField[] = [
    { id: 'title', label: 'Title' },
    { id: 'body', label: 'Body' },
  ]
  page.actions?.forEach((action, i) => {
    fields.push({ id: `label:${i}`, label: `Button ${i + 1} · ${action}` })
  })
  for (const f of profile?.fields ?? []) if (f.localized) fields.push({ id: `field:${f.key}`, label: f.key })
  return fields
}

export function defaultWordFields(defaultActions: string[]): WordField[] {
  return defaultActions.map((action, i) => ({ id: `label:${i}`, label: `Button ${i + 1} · ${action}` }))
}

export function readWord(copy: Pick<PageCopy, 'title' | 'body' | 'actionLabels' | 'fields'> | undefined, id: string) {
  if (!copy) return ''
  if (id === 'title') return copy.title
  if (id === 'body') return copy.body
  if (id.startsWith('label:')) return copy.actionLabels[Number(id.slice(6))] ?? ''
  if (id.startsWith('field:')) return copy.fields[id.slice(6)] ?? ''
  return ''
}

/** Returns a copy with one word replaced. `machine` says whether it is unreviewed machine output. */
export function writeWord(copy: PageCopy | undefined, id: string, value: string, machine = false): PageCopy {
  const next: PageCopy = copy
    ? { ...copy, actionLabels: [...copy.actionLabels], fields: { ...copy.fields }, machine: [...copy.machine] }
    : emptyCopy()
  if (id === 'title') next.title = value
  else if (id === 'body') next.body = value
  else if (id.startsWith('label:')) {
    const i = Number(id.slice(6))
    while (next.actionLabels.length <= i) next.actionLabels.push('')
    next.actionLabels[i] = value
  } else if (id.startsWith('field:')) next.fields[id.slice(6)] = value
  next.machine = next.machine.filter((m) => m !== id)
  if (machine) next.machine.push(id)
  return next
}

const blank = (s: string | undefined) => !s || s.trim() === ''

/**
 * The words a language still lacks, as "page · word" labels. A localized field is
 * required on a page once any enabled language has a value for it there.
 */
export function missingWords(draft: OnboardingDraft, profile: AppProfile | null, locale: string): string[] {
  const missing: string[] = []
  const enabled = new Set([draft.defaultLocale, ...draft.locales])
  draft.defaultActions.forEach((action, i) => {
    if (blank(draft.defaultLabels[locale]?.labels[i])) missing.push(`Default buttons · ${action}`)
  })
  for (const page of draft.pages) {
    const copy = page.copy[locale]
    for (const word of pageWordFields(page, profile)) {
      if (!blank(readWord(copy, word.id))) continue
      if (word.id.startsWith('field:')) {
        const usedElsewhere = Object.entries(page.copy).some(([l, c]) => enabled.has(l) && !blank(readWord(c, word.id)))
        if (!usedElsewhere) continue
      }
      missing.push(`${page.key} · ${word.label}`)
    }
  }
  return missing
}

/** Enabled languages, default first. */
export function draftLocales(draft: Pick<OnboardingDraft, 'defaultLocale' | 'locales'>) {
  return [draft.defaultLocale, ...draft.locales.filter((l) => l !== draft.defaultLocale)]
}

// ── Building a release ──────────────────────────────────────────────────────

/** Apps refuse bigger documents; keeps a slow connection's download small too. */
export const ONBOARDING_DOCUMENT_MAX_BYTES = 200 * 1024

export interface ReleaseBuild {
  /** Contract documents of the languages that go live, by locale. */
  documents: Record<string, OnboardingDocument>
  /** Problems that block publishing. */
  errors: string[]
  warnings: string[]
  /** Languages left out because some words are missing. */
  skipped: Array<{ locale: string; missing: string[] }>
  /** Files the release refers to. */
  fileIds: string[]
}

function checkFieldValue(field: ProfileField, value: FieldValue): string | null {
  if (field.type === 'enum')
    return typeof value === 'string' && field.options!.includes(value) ? null : `one of ${field.options!.join(', ')}`
  if (field.type === 'text') return typeof value === 'string' ? null : 'text'
  if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value) ? null : 'a number'
  return typeof value === 'boolean' ? null : 'true or false'
}

/**
 * Turns a draft into the documents a release freezes, and says what stops it.
 * Planner refuses to publish what the app would refuse to show: the app drops a
 * whole document over one broken page.
 */
export function buildRelease(
  draft: OnboardingDraft,
  profile: AppProfile | null,
  files: ReadonlyMap<string, MediaFile>,
  version: number,
): ReleaseBuild {
  const errors: string[] = []
  const warnings: string[] = []
  const build: ReleaseBuild = { documents: {}, errors, warnings, skipped: [], fileIds: [] }
  if (!profile) {
    errors.push('Import the app profile for this app group first')
    return build
  }
  if (draft.pages.length === 0) errors.push('Add at least one page')

  const actions = new Set(profile.actions)
  const platforms = new Set(profile.platforms)
  const fieldsByKey = new Map(profile.fields.map((f) => [f.key, f]))
  const colorKeys = new Set(profile.colors.map((c) => c.key))
  const mediaByKey = new Map(profile.media.map((m) => [m.key, m]))

  for (const action of draft.defaultActions) {
    if (!actions.has(action)) errors.push(`Default buttons: "${action}" is not an action of ${profile.app}`)
  }

  const seen = new Set<string>()
  for (const page of draft.pages) {
    const name = `Page ${page.key}`
    if (seen.has(page.key)) errors.push(`${name}: the page id is used twice`)
    seen.add(page.key)

    const own = page.actions
    const effective = own ?? draft.defaultActions
    if (!effective.some((a) => a !== 'skip')) errors.push(`${name}: needs a main button (an action other than skip)`)
    for (const action of own ?? []) {
      if (!actions.has(action)) errors.push(`${name}: "${action}" is not an action of ${profile.app}`)
    }
    for (const p of page.platforms) {
      if (!platforms.has(p)) errors.push(`${name}: "${p}" is not a platform of ${profile.app}`)
    }
    for (const [key, value] of Object.entries(page.fields)) {
      const field = fieldsByKey.get(key)
      if (!field || field.localized) {
        errors.push(`${name}: field "${key}" is not a shared field of ${profile.app}`)
        continue
      }
      const expected = checkFieldValue(field, value)
      if (expected) errors.push(`${name}: field "${key}" must be ${expected}`)
    }
    for (const [locale, copy] of Object.entries(page.copy)) {
      for (const key of Object.keys(copy.fields)) {
        if (blank(copy.fields[key])) continue
        if (!fieldsByKey.get(key)?.localized)
          errors.push(`${name} (${locale}): "${key}" is not a translated field of ${profile.app}`)
      }
    }
    for (const color of page.colors) {
      if (!colorKeys.has(color.key)) errors.push(`${name}: colour "${color.key}" is not a colour of ${profile.app}`)
      else if (!isHexColor(color.value)) errors.push(`${name}: colour "${color.key}" must be hex, like #2B93F0`)
    }
    for (const m of page.media) {
      const slot = mediaByKey.get(m.key)
      const file = files.get(m.fileId)
      if (!slot) errors.push(`${name}: media "${m.key}" is not a media slot of ${profile.app}`)
      else if (!file) errors.push(`${name}: the file for "${m.key}" is missing`)
      else if (!slot.accept.includes(file.contentType))
        errors.push(`${name}: "${m.key}" accepts ${slot.accept.join(', ')}, not ${file.contentType}`)
      else if (!file.width || !file.height) errors.push(`${name}: the file for "${m.key}" has no known pixel size`)
    }
  }

  for (const platform of profile.platforms) {
    const pages = draft.pages.filter((p) => p.platforms.length === 0 || p.platforms.includes(platform))
    if (draft.pages.length > 0 && pages.length === 0) errors.push(`No page is left for ${platform}`)
    const last = pages.at(-1)
    const main = last && (last.actions ?? draft.defaultActions).find((a) => a !== 'skip')
    if (last && main === 'next') {
      const message = `The last page (${last.key}) ends with "next", which only closes the story`
      if (!warnings.includes(message)) warnings.push(message)
    }
  }

  const defaultMissing = missingWords(draft, profile, draft.defaultLocale)
  if (defaultMissing.length > 0) {
    errors.push(`${draft.defaultLocale} (the default language) is missing: ${summarize(defaultMissing)}`)
  }
  if (errors.length > 0) return build

  const fileIds = new Set<string>()
  for (const locale of draftLocales(draft)) {
    const missing = locale === draft.defaultLocale ? [] : missingWords(draft, profile, locale)
    if (missing.length > 0) {
      build.skipped.push({ locale, missing })
      continue
    }
    const document = documentFor(draft, profile, files, version, locale, fileIds)
    const parsed = onboardingDocumentSchema.safeParse(document)
    if (!parsed.success) {
      errors.push(`${locale}: ${parsed.error.issues[0]!.path.join('.')} ${parsed.error.issues[0]!.message}`)
      continue
    }
    const bytes = utf8Length(JSON.stringify(document))
    if (bytes > ONBOARDING_DOCUMENT_MAX_BYTES) {
      errors.push(`${locale}: the document is ${Math.ceil(bytes / 1024)} KB, over the 200 KB limit`)
      continue
    }
    build.documents[locale] = document
  }
  build.fileIds = [...fileIds]
  return build
}

/** UTF-8 byte length without TextEncoder (this package has no DOM or Node types). */
function utf8Length(s: string) {
  let bytes = 0
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

function summarize(items: string[], max = 5) {
  return items.length > max ? `${items.slice(0, max).join('; ')} and ${items.length - max} more` : items.join('; ')
}

function documentFor(
  draft: OnboardingDraft,
  profile: AppProfile,
  files: ReadonlyMap<string, MediaFile>,
  version: number,
  locale: string,
  fileIds: Set<string>,
): OnboardingDocument {
  const labelsFor = (names: string[], labels: string[] = []) =>
    names.map((action, i) => ({ action, label: labels[i] ?? '' }))
  const document: OnboardingDocument = { id: draft.key, version, locale, pages: [] }
  if (draft.defaultActions.length > 0) {
    document.actions = labelsFor(draft.defaultActions, draft.defaultLabels[locale]?.labels)
  }
  const localized = new Set(profile.fields.filter((f) => f.localized).map((f) => f.key))
  for (const page of draft.pages) {
    const copy = page.copy[locale] ?? emptyCopy()
    const out: OnboardingPageDocument = { id: page.key, title: copy.title, body: copy.body }
    if (page.platforms.length > 0) out.when = { platforms: [...page.platforms] }
    if (page.actions) out.actions = labelsFor(page.actions, copy.actionLabels)
    const fields: Record<string, FieldValue> = { ...page.fields }
    for (const [key, value] of Object.entries(copy.fields)) if (localized.has(key) && !blank(value)) fields[key] = value
    if (Object.keys(fields).length > 0) out.fields = fields
    if (page.colors.length > 0) out.colors = page.colors.map((c) => ({ key: c.key, value: c.value }))
    if (page.media.length > 0) {
      out.media = page.media.map((m) => {
        const file = files.get(m.fileId)!
        fileIds.add(file.id)
        return {
          key: m.key,
          url: mediaPath(file.sha256),
          mimeType: file.contentType,
          width: file.width!,
          height: file.height!,
        }
      })
    }
    document.pages.push(out)
  }
  return document
}

// ── What changed since the last release ─────────────────────────────────────

export interface ReleaseDiff {
  first: boolean
  addedLocales: string[]
  removedLocales: string[]
  addedPages: string[]
  removedPages: string[]
  reordered: boolean
  /** Pages whose content differs in at least one language both releases have. */
  changedPages: Array<{ id: string; locales: string[] }>
  /** Languages whose default buttons changed. */
  defaultButtons: string[]
}

/** JSON with object keys sorted, so documents compare equal whatever key order storage gave them (jsonb reorders). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function diffReleases(
  previous: Record<string, OnboardingDocument> | null,
  next: Record<string, OnboardingDocument>,
  defaultLocale: string,
): ReleaseDiff {
  const diff: ReleaseDiff = {
    first: !previous,
    addedLocales: [],
    removedLocales: [],
    addedPages: [],
    removedPages: [],
    reordered: false,
    changedPages: [],
    defaultButtons: [],
  }
  if (!previous) return diff
  const before = Object.keys(previous)
  const after = Object.keys(next)
  diff.addedLocales = after.filter((l) => !before.includes(l))
  diff.removedLocales = before.filter((l) => !after.includes(l))

  const idsOf = (doc: OnboardingDocument | undefined) => doc?.pages.map((p) => p.id) ?? []
  const oldIds = idsOf(previous[defaultLocale] ?? Object.values(previous)[0])
  const newIds = idsOf(next[defaultLocale] ?? Object.values(next)[0])
  diff.addedPages = newIds.filter((id) => !oldIds.includes(id))
  diff.removedPages = oldIds.filter((id) => !newIds.includes(id))
  const kept = newIds.filter((id) => oldIds.includes(id))
  diff.reordered = kept.join('\n') !== oldIds.filter((id) => newIds.includes(id)).join('\n')

  const common = after.filter((l) => before.includes(l))
  for (const id of kept) {
    const locales = common.filter((l) => {
      const a = previous[l]!.pages.find((p) => p.id === id)
      const b = next[l]!.pages.find((p) => p.id === id)
      return canonicalJson(a) !== canonicalJson(b)
    })
    if (locales.length > 0) diff.changedPages.push({ id, locales })
  }
  diff.defaultButtons = common.filter(
    (l) => canonicalJson(previous[l]!.actions ?? null) !== canonicalJson(next[l]!.actions ?? null),
  )
  return diff
}

// ── Colour contrast (editor warning for ink on the page wash) ───────────────

function luminance(hex: string) {
  let h = hex.slice(1)
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const channel = (i: number) => {
    const c = Number.parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** WCAG contrast ratio of two hex colours (alpha ignored), or null when either isn't hex. */
export function contrastRatio(a: string, b: string): number | null {
  if (!isHexColor(a) || !isHexColor(b)) return null
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The version a new release carries; apps show an onboarding again to people who skipped
 * or dismissed it when the version goes up. A silent fix keeps Production's version.
 * Offering it again goes above every version ever released, not just Production's:
 * Production may have been rolled back below a version people already turned down.
 */
export function nextReleaseVersion(
  productionVersion: number | null,
  highestVersion: number | null,
  offerAgain: boolean,
): number {
  if (productionVersion === null) return 1
  if (!offerAgain) return productionVersion
  return Math.max(productionVersion, highestVersion ?? 0) + 1
}

// ── API inputs and outputs ──────────────────────────────────────────────────

export const onboardingKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Lowercase letters, digits and hyphens, like capsule-intro')
  .max(64)

export const pageKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Letters, digits, - and _, like more-than-cards')
  .max(64)

export const localeCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/, 'A language code like en, pt-BR or zh-Hant')

const fieldValueSchema = z.union([z.string().max(2000), z.number(), z.boolean()])

export const onboardingIdInput = z.object({ onboardingId: z.uuid() })

export const createOnboardingInput = z.object({
  groupId: z.uuid(),
  key: onboardingKeySchema,
  name: z.string().trim().min(1, 'Enter a name').max(120),
  defaultLocale: localeCodeSchema,
})
export type CreateOnboardingInput = z.infer<typeof createOnboardingInput>

export const updateOnboardingInput = z.object({
  onboardingId: z.uuid(),
  key: onboardingKeySchema,
  name: z.string().trim().min(1, 'Enter a name').max(120),
  defaultLocale: localeCodeSchema,
  locales: z.array(localeCodeSchema).max(100),
  defaultActions: z.array(vocabularyKey).max(5),
})
export type UpdateOnboardingInput = z.infer<typeof updateOnboardingInput>

export const savePageInput = z.object({
  onboardingId: z.uuid(),
  /** Absent creates a page at the end. */
  pageId: z.uuid().optional(),
  key: pageKeySchema,
  actions: z.array(vocabularyKey).min(1).max(5).nullable(),
  platforms: z.array(vocabularyKey).max(10),
  fields: z.record(z.string(), fieldValueSchema),
  colors: z.array(z.object({ key: vocabularyKey, value: z.string().max(9) })).max(20),
  media: z.array(z.object({ key: vocabularyKey, fileId: z.uuid() })).max(10),
})
export type SavePageInput = z.infer<typeof savePageInput>

export const pageIdInput = z.object({ pageId: z.uuid() })

export const reorderPagesInput = z.object({ onboardingId: z.uuid(), ids: z.array(z.uuid()).min(1).max(100) })

const copyText = z.string().max(4000)

export const saveCopyInput = z.object({
  onboardingId: z.uuid(),
  pages: z
    .array(
      z.object({
        pageId: z.uuid(),
        locale: localeCodeSchema,
        title: copyText,
        body: copyText,
        actionLabels: z.array(copyText).max(5),
        fields: z.record(z.string(), copyText),
        machine: z.array(z.string().max(80)).max(50),
      }),
    )
    .max(5000),
  defaultLabels: z
    .array(
      z.object({
        locale: localeCodeSchema,
        labels: z.array(copyText).max(5),
        machine: z.array(z.string().max(80)).max(10),
      }),
    )
    .max(200),
})
export type SaveCopyInput = z.infer<typeof saveCopyInput>

export const importOnboardingInput = z.object({
  groupId: z.uuid(),
  json: z.string().min(2).max(5_000_000),
})

export const publishOnboardingInput = z.object({
  onboardingId: z.uuid(),
  /** Bumps `version` past production's, so people who skipped or dismissed it see it again. */
  offerAgain: z.boolean(),
  /** Where the new release goes live. */
  environmentId: z.uuid(),
})

/** Serve an existing release in an environment: promote what was tested, or roll back. */
export const deployReleaseInput = z.object({ onboardingId: z.uuid(), environmentId: z.uuid(), releaseId: z.uuid() })

/** An onboarding in one environment, e.g. to make Development follow production again. */
export const onboardingEnvironmentInput = z.object({ onboardingId: z.uuid(), environmentId: z.uuid() })

export const saveAppProfileInput = z.object({ groupId: z.uuid(), json: z.string().min(2).max(200_000) })

export interface OnboardingSummary {
  id: string
  groupId: string
  groupName: string
  key: string
  name: string
  defaultLocale: string
  /** Enabled languages (default included). */
  localeCount: number
  /** Languages with every word filled in. */
  completeCount: number
  /** One per environment of the project, production first. */
  deployments: OnboardingDeployment[]
}

export interface OnboardingRelease {
  id: string
  version: number
  revision: number
  locales: string[]
  publishedAt: Date
  publishedBy: string | null
}

/** What one environment serves of an onboarding. */
export interface OnboardingDeployment {
  environmentId: string
  /** Its own release, or production's while it follows production. Null: apps there get 404. */
  release: OnboardingRelease | null
  /** No release of its own, so it serves production's. Never true for production. */
  followsProduction: boolean
  /** When its own release was put there. */
  deployedAt: Date | null
}

export interface OnboardingDetail {
  draft: OnboardingDraft
  profile: AppProfile | null
  /** Files the draft's pages use, by id. */
  files: Record<string, MediaFile>
  latestRelease: OnboardingRelease | null
  /** One per environment of the project, production first. */
  deployments: OnboardingDeployment[]
}

export interface PublishPreview {
  errors: string[]
  warnings: string[]
  locales: string[]
  skipped: Array<{ locale: string; missing: string[] }>
  /** Against what the chosen environment serves now. */
  diff: ReleaseDiff
  /** What the chosen environment serves now. */
  current: { version: number; revision: number } | null
  /** Production's version: offering it again is measured from it. Null before anything is in production. */
  productionVersion: number | null
  /** The version the new release will carry. */
  version: number
}

export interface DeployPreview {
  /** Against what the environment serves now. */
  diff: ReleaseDiff
  current: { version: number; revision: number } | null
  release: { version: number; revision: number }
}

// ── Project API keys (read-only access to published content) ────────────────

export const createApiKeyInput = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  environmentId: z.uuid('Choose an environment'),
})
export const apiKeyIdInput = z.object({ apiKeyId: z.uuid() })

export interface ApiKey {
  id: string
  name: string
  /** First characters of the key, to tell keys apart. */
  prefix: string
  environmentId: string
  createdAt: Date
  lastUsedAt: Date | null
}
