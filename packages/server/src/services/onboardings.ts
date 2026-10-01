import { createHash } from 'node:crypto'
import { type Db, schema } from '@planner/db'
import {
  type ApiKey,
  type AppProfile,
  appProfileSchema,
  buildRelease,
  type CreateOnboardingInput,
  type DeployPreview,
  diffReleases,
  draftLocales,
  exportDraft,
  importStored,
  type MediaFile,
  missingWords,
  nextReleaseVersion,
  type OnboardingDeployment,
  type OnboardingDetail,
  type OnboardingDocument,
  type OnboardingDraft,
  type OnboardingRelease,
  type OnboardingSummary,
  onboardingDocumentSchema,
  type PageCopy,
  type PublishPreview,
  parseAppProfile,
  resolveOnboardingLocale,
  type SaveCopyInput,
  type SavePageInput,
  sortEnvironments,
  storedOnboardingSchema,
  type UpdateOnboardingInput,
} from '@planner/shared'
import { and, asc, desc, eq, inArray, isNull, lt, max, or, sql } from 'drizzle-orm'
import { generateToken, hashToken } from '../auth/tokens'
import { extensionFor, mediaInfo } from '../images/media'
import type { Storage } from '../storage'
import { fileUrl } from './screenshots'

export type OnboardingErrorCode = 'NOT_FOUND' | 'INVALID' | 'CONFLICT'

export class OnboardingError extends Error {
  constructor(
    public readonly code: OnboardingErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'OnboardingError'
  }
}

export interface OnboardingDeps {
  storage: Storage
}

/** Uploads for onboarding pages: what Wallet's profile accepts. nginx caps request bodies at 25 MB. */
export const ONBOARDING_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4'] as const
export const ONBOARDING_MEDIA_MAX_BYTES = 20 * 1024 * 1024

const API_KEY_PREFIX = 'plk_'

/** Whether an onboarding page or release still refers to a file, so it must not be deleted. */
export async function fileUsedByOnboardings(db: Db, fileId: string) {
  const [released] = await db
    .select({ id: schema.onboardingReleaseFiles.fileId })
    .from(schema.onboardingReleaseFiles)
    .where(eq(schema.onboardingReleaseFiles.fileId, fileId))
    .limit(1)
  if (released) return true
  const [page] = await db
    .select({ id: schema.onboardingPages.id })
    .from(schema.onboardingPages)
    .where(sql`${schema.onboardingPages.media} @> ${JSON.stringify([{ fileId }])}::jsonb`)
    .limit(1)
  return !!page
}

const toMediaFile = (f: typeof schema.files.$inferSelect): MediaFile => ({
  id: f.id,
  sha256: f.sha256,
  contentType: f.contentType,
  width: f.width,
  height: f.height,
  url: fileUrl(f.id),
})

const toRelease = (r: typeof schema.onboardingReleases.$inferSelect): OnboardingRelease => ({
  id: r.id,
  version: r.version,
  revision: r.revision,
  locales: [
    r.defaultLocale,
    ...Object.keys(r.document)
      .filter((l) => l !== r.defaultLocale)
      .sort(),
  ],
  publishedAt: r.publishedAt,
  publishedBy: r.publishedBy,
})

const unique = <T>(items: T[]) => [...new Set(items)]

type ReleaseRow = typeof schema.onboardingReleases.$inferSelect
type EnvironmentRow = typeof schema.projectEnvironments.$inferSelect

/** Compare two releases as if they carried the same version, so the diff shows content only. */
function diffContent(from: ReleaseRow | null, to: Record<string, OnboardingDocument>, defaultLocale: string) {
  const version = Object.values(to)[0]?.version ?? 1
  const withVersion = (docs: Record<string, OnboardingDocument>) =>
    Object.fromEntries(Object.entries(docs).map(([l, d]) => [l, { ...d, version }]))
  return diffReleases(from ? withVersion(from.document) : null, to, defaultLocale)
}

export function onboardingsService(db: Db, deps: OnboardingDeps) {
  async function requireGroup(projectId: string, groupId: string) {
    const group = await db.query.appGroups.findFirst({
      where: and(eq(schema.appGroups.id, groupId), eq(schema.appGroups.projectId, projectId)),
    })
    if (!group) throw new OnboardingError('NOT_FOUND', 'App group not found')
    return group
  }

  async function requireOnboarding(projectId: string, onboardingId: string) {
    const row = await db.query.onboardings.findFirst({
      where: and(eq(schema.onboardings.id, onboardingId), eq(schema.onboardings.projectId, projectId)),
    })
    if (!row) throw new OnboardingError('NOT_FOUND', 'Onboarding not found')
    return row
  }

  async function requirePage(projectId: string, pageId: string) {
    const [row] = await db
      .select({ page: schema.onboardingPages })
      .from(schema.onboardingPages)
      .innerJoin(schema.onboardings, eq(schema.onboardingPages.onboardingId, schema.onboardings.id))
      .where(and(eq(schema.onboardingPages.id, pageId), eq(schema.onboardings.projectId, projectId)))
    if (!row) throw new OnboardingError('NOT_FOUND', 'Page not found')
    return row.page
  }

  async function assertKeyFree(projectId: string, key: string, exceptId?: string) {
    const clash = await db.query.onboardings.findFirst({
      where: and(eq(schema.onboardings.projectId, projectId), eq(schema.onboardings.key, key)),
    })
    if (clash && clash.id !== exceptId) throw new OnboardingError('CONFLICT', `An onboarding with key ${key} exists`)
  }

  async function profileFor(groupId: string): Promise<AppProfile | null> {
    const row = await db.query.appProfiles.findFirst({ where: eq(schema.appProfiles.appGroupId, groupId) })
    if (!row) return null
    // Stored profiles were validated on import; parse again so defaults apply to older rows.
    const parsed = appProfileSchema.safeParse(row.profile)
    return parsed.success ? parsed.data : null
  }

  async function loadDraft(o: typeof schema.onboardings.$inferSelect): Promise<OnboardingDraft> {
    const pages = await db
      .select()
      .from(schema.onboardingPages)
      .where(eq(schema.onboardingPages.onboardingId, o.id))
      .orderBy(asc(schema.onboardingPages.position), asc(schema.onboardingPages.createdAt))
    const copies =
      pages.length > 0
        ? await db
            .select()
            .from(schema.onboardingPageCopy)
            .where(
              inArray(
                schema.onboardingPageCopy.pageId,
                pages.map((p) => p.id),
              ),
            )
        : []
    const labels = await db
      .select()
      .from(schema.onboardingDefaultLabels)
      .where(eq(schema.onboardingDefaultLabels.onboardingId, o.id))
    return {
      id: o.id,
      projectId: o.projectId,
      groupId: o.appGroupId,
      key: o.key,
      name: o.name,
      defaultLocale: o.defaultLocale,
      locales: draftLocales(o),
      defaultActions: o.defaultActions,
      defaultLabels: Object.fromEntries(labels.map((l) => [l.locale, { labels: l.labels, machine: l.machine }])),
      pages: pages.map((p) => ({
        id: p.id,
        key: p.key,
        actions: p.actions,
        platforms: p.platforms,
        fields: p.fields,
        colors: p.colors,
        media: p.media,
        copy: Object.fromEntries(
          copies
            .filter((c) => c.pageId === p.id)
            .map((c): [string, PageCopy] => [
              c.locale,
              { title: c.title, body: c.body, actionLabels: c.actionLabels, fields: c.fields, machine: c.machine },
            ]),
        ),
      })),
    }
  }

  async function filesFor(projectId: string, draft: OnboardingDraft) {
    const ids = unique(draft.pages.flatMap((p) => p.media.map((m) => m.fileId)))
    if (ids.length === 0) return new Map<string, MediaFile>()
    const rows = await db
      .select()
      .from(schema.files)
      .where(and(eq(schema.files.projectId, projectId), inArray(schema.files.id, ids)))
    return new Map(rows.map((f) => [f.id, toMediaFile(f)]))
  }

  async function requireRelease(onboardingId: string, releaseId: string) {
    const row = await db.query.onboardingReleases.findFirst({
      where: and(eq(schema.onboardingReleases.id, releaseId), eq(schema.onboardingReleases.onboardingId, onboardingId)),
    })
    if (!row) throw new OnboardingError('NOT_FOUND', 'Release not found')
    return row
  }

  async function latestRelease(onboardingId: string) {
    const [row] = await db
      .select()
      .from(schema.onboardingReleases)
      .where(eq(schema.onboardingReleases.onboardingId, onboardingId))
      .orderBy(desc(schema.onboardingReleases.revision))
      .limit(1)
    return row ?? null
  }

  async function requireEnvironment(projectId: string, environmentId: string) {
    const row = await db.query.projectEnvironments.findFirst({
      where: and(eq(schema.projectEnvironments.id, environmentId), eq(schema.projectEnvironments.projectId, projectId)),
    })
    if (!row) throw new OnboardingError('NOT_FOUND', 'Environment not found')
    return row
  }

  async function environmentsOf(projectId: string) {
    const rows = await db
      .select()
      .from(schema.projectEnvironments)
      .where(eq(schema.projectEnvironments.projectId, projectId))
    return sortEnvironments(rows)
  }

  /** What `env` serves of an onboarding: its own release, else production's. */
  async function servedRelease(onboardingId: string, env: EnvironmentRow): Promise<ReleaseRow | null> {
    const rows = await db
      .select({ release: schema.onboardingReleases, environmentId: schema.onboardingDeployments.environmentId })
      .from(schema.onboardingDeployments)
      .innerJoin(schema.onboardingReleases, eq(schema.onboardingDeployments.releaseId, schema.onboardingReleases.id))
      .innerJoin(
        schema.projectEnvironments,
        eq(schema.onboardingDeployments.environmentId, schema.projectEnvironments.id),
      )
      .where(
        and(
          eq(schema.onboardingDeployments.onboardingId, onboardingId),
          or(eq(schema.onboardingDeployments.environmentId, env.id), eq(schema.projectEnvironments.isProduction, true)),
        ),
      )
    return (rows.find((r) => r.environmentId === env.id) ?? rows[0])?.release ?? null
  }

  /** What every environment of the project serves of an onboarding, production first. */
  async function deploymentsOf(onboardingId: string, envs: EnvironmentRow[]): Promise<OnboardingDeployment[]> {
    const rows = await db
      .select({ deployment: schema.onboardingDeployments, release: schema.onboardingReleases })
      .from(schema.onboardingDeployments)
      .innerJoin(schema.onboardingReleases, eq(schema.onboardingDeployments.releaseId, schema.onboardingReleases.id))
      .where(eq(schema.onboardingDeployments.onboardingId, onboardingId))
    const own = new Map(rows.map((r) => [r.deployment.environmentId, r]))
    const production = envs.find((e) => e.isProduction)
    const productionRelease = production ? own.get(production.id)?.release : undefined
    return envs.map((env) => {
      const mine = own.get(env.id)
      const release = mine?.release ?? (env.isProduction ? undefined : productionRelease)
      return {
        environmentId: env.id,
        release: release ? toRelease(release) : null,
        followsProduction: !mine && !env.isProduction,
        deployedAt: mine?.deployment.deployedAt ?? null,
      }
    })
  }

  async function deploy(
    onboardingId: string,
    environmentId: string,
    releaseId: string,
    userId: string,
    tx: Pick<Db, 'insert'> = db,
  ) {
    const values = { releaseId, deployedAt: new Date(), deployedBy: userId }
    await tx
      .insert(schema.onboardingDeployments)
      .values({ onboardingId, environmentId, ...values })
      .onConflictDoUpdate({
        target: [schema.onboardingDeployments.onboardingId, schema.onboardingDeployments.environmentId],
        set: values,
      })
  }

  /** The highest version any release of the onboarding carried (versions go down after a rollback's silent fix). */
  async function highestVersion(onboardingId: string) {
    const [row] = await db
      .select({ version: max(schema.onboardingReleases.version) })
      .from(schema.onboardingReleases)
      .where(eq(schema.onboardingReleases.onboardingId, onboardingId))
    return row?.version ?? null
  }

  /**
   * The documents a publish to `environmentId` would freeze now. The version follows
   * production's (see nextReleaseVersion), so offering it again on Development means
   * production users see it again once it's promoted, and a plain publish there never does.
   */
  async function prepare(projectId: string, onboardingId: string, offerAgain: boolean, environmentId: string) {
    const o = await requireOnboarding(projectId, onboardingId)
    const env = await requireEnvironment(projectId, environmentId)
    const production = env.isProduction ? env : (await environmentsOf(projectId)).find((e) => e.isProduction)
    const draft = await loadDraft(o)
    const [profile, files, latest, highest, current, live] = await Promise.all([
      profileFor(o.appGroupId),
      filesFor(projectId, draft),
      latestRelease(o.id),
      highestVersion(o.id),
      servedRelease(o.id, env),
      production ? servedRelease(o.id, production) : null,
    ])
    const version = nextReleaseVersion(live?.version ?? null, highest, offerAgain)
    const build = buildRelease(draft, profile, files, version)
    const diff = diffContent(current, build.documents, draft.defaultLocale)
    return { o, env, draft, build, latest, current, live, version, diff }
  }

  async function replaceDraft(
    onboardingId: string,
    imported: ReturnType<typeof importStored>,
    fileIdBySha: Map<string, string>,
  ) {
    await db.transaction(async (tx) => {
      await tx.delete(schema.onboardingPages).where(eq(schema.onboardingPages.onboardingId, onboardingId))
      await tx
        .delete(schema.onboardingDefaultLabels)
        .where(eq(schema.onboardingDefaultLabels.onboardingId, onboardingId))
      for (const [position, page] of imported.pages.entries()) {
        const [row] = await tx
          .insert(schema.onboardingPages)
          .values({
            onboardingId,
            key: page.key,
            position,
            actions: page.actions,
            platforms: page.platforms,
            fields: page.fields,
            colors: page.colors,
            media: page.media.flatMap((m) => {
              const fileId = fileIdBySha.get(m.sha256)
              return fileId ? [{ key: m.key, fileId }] : []
            }),
          })
          .returning()
        const copies = Object.entries(page.copy).map(([locale, c]) => ({ pageId: row!.id, locale, ...c }))
        if (copies.length > 0) await tx.insert(schema.onboardingPageCopy).values(copies)
      }
      const labels = Object.entries(imported.defaultLabels).map(([locale, l]) => ({ onboardingId, locale, ...l }))
      if (labels.length > 0) await tx.insert(schema.onboardingDefaultLabels).values(labels)
    })
  }

  /** The environment a key belongs to, or null. Records use at most every few minutes. */
  async function verifyApiKey(token: string) {
    if (!token.startsWith(API_KEY_PREFIX)) return null
    const [found] = await db
      .select({ key: schema.projectApiKeys, environment: schema.projectEnvironments })
      .from(schema.projectApiKeys)
      .innerJoin(schema.projectEnvironments, eq(schema.projectApiKeys.environmentId, schema.projectEnvironments.id))
      .where(eq(schema.projectApiKeys.tokenHash, hashToken(token)))
    if (!found) return null
    const row = found.key
    const stale = new Date(Date.now() - 5 * 60 * 1000)
    await db
      .update(schema.projectApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(schema.projectApiKeys.id, row.id),
          or(isNull(schema.projectApiKeys.lastUsedAt), lt(schema.projectApiKeys.lastUsedAt, stale)),
        ),
      )
    return found.environment
  }

  return {
    async list(projectId: string): Promise<OnboardingSummary[]> {
      const rows = await db
        .select({ o: schema.onboardings, groupName: schema.appGroups.name })
        .from(schema.onboardings)
        .innerJoin(schema.appGroups, eq(schema.onboardings.appGroupId, schema.appGroups.id))
        .where(eq(schema.onboardings.projectId, projectId))
        .orderBy(asc(schema.onboardings.createdAt))
      const profiles = new Map<string, AppProfile | null>()
      const envs = await environmentsOf(projectId)
      const out: OnboardingSummary[] = []
      for (const { o, groupName } of rows) {
        if (!profiles.has(o.appGroupId)) profiles.set(o.appGroupId, await profileFor(o.appGroupId))
        const draft = await loadDraft(o)
        const profile = profiles.get(o.appGroupId) ?? null
        const locales = draftLocales(draft)
        out.push({
          id: o.id,
          groupId: o.appGroupId,
          groupName,
          key: o.key,
          name: o.name,
          defaultLocale: o.defaultLocale,
          localeCount: locales.length,
          completeCount: locales.filter((l) => missingWords(draft, profile, l).length === 0).length,
          deployments: await deploymentsOf(o.id, envs),
        })
      }
      return out
    },

    async create(projectId: string, input: CreateOnboardingInput) {
      await requireGroup(projectId, input.groupId)
      await assertKeyFree(projectId, input.key)
      const profile = await profileFor(input.groupId)
      const defaultActions = ['next', 'skip'].filter((a) => !profile || profile.actions.includes(a))
      const [row] = await db
        .insert(schema.onboardings)
        .values({
          projectId,
          appGroupId: input.groupId,
          key: input.key,
          name: input.name,
          defaultLocale: input.defaultLocale,
          locales: [input.defaultLocale],
          defaultActions,
        })
        .returning()
      return row!
    },

    async get(projectId: string, onboardingId: string): Promise<OnboardingDetail> {
      const o = await requireOnboarding(projectId, onboardingId)
      const draft = await loadDraft(o)
      const [profile, files, latest, deployments] = await Promise.all([
        profileFor(o.appGroupId),
        filesFor(projectId, draft),
        latestRelease(o.id),
        environmentsOf(projectId).then((envs) => deploymentsOf(o.id, envs)),
      ])
      return {
        draft,
        profile,
        files: Object.fromEntries(files),
        latestRelease: latest ? toRelease(latest) : null,
        deployments,
      }
    },

    async update(projectId: string, input: UpdateOnboardingInput) {
      const o = await requireOnboarding(projectId, input.onboardingId)
      if (input.key !== o.key) await assertKeyFree(projectId, input.key, o.id)
      const locales = unique([input.defaultLocale, ...input.locales])
      const [row] = await db
        .update(schema.onboardings)
        .set({
          key: input.key,
          name: input.name,
          defaultLocale: input.defaultLocale,
          locales,
          defaultActions: input.defaultActions,
          updatedAt: new Date(),
        })
        .where(eq(schema.onboardings.id, o.id))
        .returning()
      return row!
    },

    async remove(projectId: string, onboardingId: string) {
      const o = await requireOnboarding(projectId, onboardingId)
      await db.delete(schema.onboardings).where(eq(schema.onboardings.id, o.id))
    },

    async savePage(projectId: string, input: SavePageInput) {
      const o = await requireOnboarding(projectId, input.onboardingId)
      const fileIds = unique(input.media.map((m) => m.fileId))
      if (fileIds.length > 0) {
        const found = await db
          .select({ id: schema.files.id })
          .from(schema.files)
          .where(and(eq(schema.files.projectId, projectId), inArray(schema.files.id, fileIds)))
        if (found.length !== fileIds.length) throw new OnboardingError('NOT_FOUND', 'File not found')
      }
      const clash = await db.query.onboardingPages.findFirst({
        where: and(eq(schema.onboardingPages.onboardingId, o.id), eq(schema.onboardingPages.key, input.key)),
      })
      if (clash && clash.id !== input.pageId)
        throw new OnboardingError('CONFLICT', `A page with id ${input.key} exists`)
      const values = {
        key: input.key,
        actions: input.actions,
        platforms: unique(input.platforms),
        // Blank text is no value at all: the app drops it too.
        fields: Object.fromEntries(Object.entries(input.fields).filter(([, v]) => v !== '')),
        colors: input.colors.filter((c) => c.value !== ''),
        media: input.media,
        updatedAt: new Date(),
      }
      if (input.pageId) {
        const page = await requirePage(projectId, input.pageId)
        if (page.onboardingId !== o.id) throw new OnboardingError('NOT_FOUND', 'Page not found')
        const [row] = await db
          .update(schema.onboardingPages)
          .set(values)
          .where(eq(schema.onboardingPages.id, page.id))
          .returning()
        return row!
      }
      const [last] = await db
        .select({ max: max(schema.onboardingPages.position) })
        .from(schema.onboardingPages)
        .where(eq(schema.onboardingPages.onboardingId, o.id))
      const [row] = await db
        .insert(schema.onboardingPages)
        .values({ onboardingId: o.id, position: (last?.max ?? -1) + 1, ...values })
        .returning()
      return row!
    },

    async removePage(projectId: string, pageId: string) {
      const page = await requirePage(projectId, pageId)
      await db.delete(schema.onboardingPages).where(eq(schema.onboardingPages.id, page.id))
    },

    async reorderPages(projectId: string, onboardingId: string, ids: string[]) {
      const o = await requireOnboarding(projectId, onboardingId)
      const pages = await db
        .select({ id: schema.onboardingPages.id })
        .from(schema.onboardingPages)
        .where(eq(schema.onboardingPages.onboardingId, o.id))
      const current = new Set(pages.map((p) => p.id))
      if (ids.length !== current.size || new Set(ids).size !== ids.length || !ids.every((id) => current.has(id))) {
        throw new OnboardingError('INVALID', 'The new order must list every page once')
      }
      await db.transaction(async (tx) => {
        for (const [position, id] of ids.entries()) {
          await tx.update(schema.onboardingPages).set({ position }).where(eq(schema.onboardingPages.id, id))
        }
      })
    },

    async saveCopy(projectId: string, input: SaveCopyInput) {
      const o = await requireOnboarding(projectId, input.onboardingId)
      const pageIds = unique(input.pages.map((p) => p.pageId))
      if (pageIds.length > 0) {
        const found = await db
          .select({ id: schema.onboardingPages.id })
          .from(schema.onboardingPages)
          .where(and(eq(schema.onboardingPages.onboardingId, o.id), inArray(schema.onboardingPages.id, pageIds)))
        if (found.length !== pageIds.length) throw new OnboardingError('NOT_FOUND', 'Page not found')
      }
      const now = new Date()
      await db.transaction(async (tx) => {
        for (const c of input.pages) {
          const values = {
            title: c.title,
            body: c.body,
            actionLabels: c.actionLabels,
            fields: c.fields,
            machine: unique(c.machine),
            updatedAt: now,
          }
          await tx
            .insert(schema.onboardingPageCopy)
            .values({ pageId: c.pageId, locale: c.locale, ...values })
            .onConflictDoUpdate({
              target: [schema.onboardingPageCopy.pageId, schema.onboardingPageCopy.locale],
              set: values,
            })
        }
        for (const l of input.defaultLabels) {
          const values = { labels: l.labels, machine: unique(l.machine), updatedAt: now }
          await tx
            .insert(schema.onboardingDefaultLabels)
            .values({ onboardingId: o.id, locale: l.locale, ...values })
            .onConflictDoUpdate({
              target: [schema.onboardingDefaultLabels.onboardingId, schema.onboardingDefaultLabels.locale],
              set: values,
            })
        }
      })
    },

    /**
     * Seeds or replaces a draft from the all-languages JSON (the app's bundled mock or
     * Planner's own export). The onboarding with the same key is replaced in place.
     */
    async importJson(projectId: string, groupId: string, json: string) {
      await requireGroup(projectId, groupId)
      const profile = await profileFor(groupId)
      if (!profile) throw new OnboardingError('INVALID', 'Import the app profile for this app group first')
      let raw: unknown
      try {
        raw = JSON.parse(json)
      } catch {
        throw new OnboardingError('INVALID', 'Not valid JSON')
      }
      const parsed = storedOnboardingSchema.safeParse(raw)
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!
        throw new OnboardingError('INVALID', `${issue.path.join('.') || 'document'}: ${issue.message}`)
      }
      const imported = importStored(parsed.data, profile)
      const shas = unique(imported.pages.flatMap((p) => p.media.map((m) => m.sha256)))
      const files =
        shas.length > 0
          ? await db
              .select()
              .from(schema.files)
              .where(and(eq(schema.files.projectId, projectId), inArray(schema.files.sha256, shas)))
          : []
      const fileIdBySha = new Map(files.map((f) => [f.sha256, f.id]))
      for (const sha of shas) {
        if (!fileIdBySha.has(sha)) imported.warnings.push(`A media file (${sha.slice(0, 8)}…) is not in this project`)
      }

      const existing = await db.query.onboardings.findFirst({
        where: and(eq(schema.onboardings.projectId, projectId), eq(schema.onboardings.key, imported.key)),
      })
      if (existing && existing.appGroupId !== groupId) {
        throw new OnboardingError('CONFLICT', `${imported.key} belongs to another app group`)
      }
      const settings = {
        name: existing?.name ?? imported.name,
        defaultLocale: imported.defaultLocale,
        locales: imported.locales,
        defaultActions: imported.defaultActions,
        updatedAt: new Date(),
      }
      const [row] = existing
        ? await db.update(schema.onboardings).set(settings).where(eq(schema.onboardings.id, existing.id)).returning()
        : await db
            .insert(schema.onboardings)
            .values({ projectId, appGroupId: groupId, key: imported.key, ...settings })
            .returning()
      await replaceDraft(row!.id, imported, fileIdBySha)
      return { onboardingId: row!.id, replaced: !!existing, warnings: imported.warnings }
    },

    async exportJson(projectId: string, onboardingId: string, publicBase: string) {
      const o = await requireOnboarding(projectId, onboardingId)
      const draft = await loadDraft(o)
      const [files, latest] = await Promise.all([filesFor(projectId, draft), latestRelease(o.id)])
      return exportDraft(draft, files, (f) => `${publicBase}/files/${f.sha256}`, latest?.version ?? 1)
    },

    async previewPublish(
      projectId: string,
      onboardingId: string,
      offerAgain: boolean,
      environmentId: string,
    ): Promise<PublishPreview> {
      const { build, current, live, version, diff } = await prepare(projectId, onboardingId, offerAgain, environmentId)
      return {
        errors: build.errors,
        warnings: build.warnings,
        locales: Object.keys(build.documents),
        skipped: build.skipped,
        diff,
        current: current ? { version: current.version, revision: current.revision } : null,
        productionVersion: live?.version ?? null,
        version,
      }
    },

    /** Freezes the draft into a release and serves it in one environment. */
    async publish(projectId: string, onboardingId: string, offerAgain: boolean, environmentId: string, userId: string) {
      const { o, env, build, latest, version } = await prepare(projectId, onboardingId, offerAgain, environmentId)
      if (build.errors.length > 0) throw new OnboardingError('INVALID', build.errors.join('\n'))
      const release = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(schema.onboardingReleases)
          .values({
            onboardingId: o.id,
            version,
            revision: (latest?.revision ?? 0) + 1,
            defaultLocale: o.defaultLocale,
            document: build.documents,
            publishedBy: userId,
          })
          .returning()
        if (build.fileIds.length > 0) {
          await tx
            .insert(schema.onboardingReleaseFiles)
            .values(build.fileIds.map((fileId) => ({ releaseId: row!.id, fileId })))
        }
        await deploy(o.id, env.id, row!.id, userId, tx)
        return row!
      })
      return toRelease(release)
    },

    /** What serving `releaseId` in an environment would change there. */
    async previewDeploy(
      projectId: string,
      onboardingId: string,
      environmentId: string,
      releaseId: string,
    ): Promise<DeployPreview> {
      const o = await requireOnboarding(projectId, onboardingId)
      const env = await requireEnvironment(projectId, environmentId)
      const release = await requireRelease(o.id, releaseId)
      const current = await servedRelease(o.id, env)
      return {
        diff: diffContent(current, release.document, release.defaultLocale),
        current: current ? { version: current.version, revision: current.revision } : null,
        release: { version: release.version, revision: release.revision },
      }
    },

    /** Serves an existing release in an environment: promotes what was tested, or rolls back. */
    async deploy(projectId: string, onboardingId: string, environmentId: string, releaseId: string, userId: string) {
      const o = await requireOnboarding(projectId, onboardingId)
      const env = await requireEnvironment(projectId, environmentId)
      const release = await requireRelease(o.id, releaseId)
      await deploy(o.id, env.id, release.id, userId)
      return toRelease(release)
    },

    /** Drops an environment's own release, so it serves production's again. */
    async followProduction(projectId: string, onboardingId: string, environmentId: string) {
      const o = await requireOnboarding(projectId, onboardingId)
      const env = await requireEnvironment(projectId, environmentId)
      if (env.isProduction) throw new OnboardingError('INVALID', 'Production can’t follow itself')
      await db
        .delete(schema.onboardingDeployments)
        .where(
          and(
            eq(schema.onboardingDeployments.onboardingId, o.id),
            eq(schema.onboardingDeployments.environmentId, env.id),
          ),
        )
    },

    async releases(projectId: string, onboardingId: string) {
      const o = await requireOnboarding(projectId, onboardingId)
      const rows = await db
        .select()
        .from(schema.onboardingReleases)
        .where(eq(schema.onboardingReleases.onboardingId, o.id))
        .orderBy(desc(schema.onboardingReleases.revision))
        .limit(50)
      return rows.map(toRelease)
    },

    async getProfile(projectId: string, groupId: string) {
      await requireGroup(projectId, groupId)
      return profileFor(groupId)
    },

    async saveProfile(projectId: string, groupId: string, json: string) {
      await requireGroup(projectId, groupId)
      const result = parseAppProfile(json)
      if ('error' in result) throw new OnboardingError('INVALID', result.error)
      await db
        .insert(schema.appProfiles)
        .values({ projectId, appGroupId: groupId, profile: result.profile })
        .onConflictDoUpdate({
          target: schema.appProfiles.appGroupId,
          set: { profile: result.profile, updatedAt: new Date() },
        })
      return result.profile
    },

    /** Stores an image or video for a page (once per project, by hash) and returns it. */
    async uploadMedia(projectId: string, onboardingId: string, bytes: Uint8Array): Promise<MediaFile> {
      await requireOnboarding(projectId, onboardingId)
      const info = mediaInfo(bytes)
      if (!info || !(ONBOARDING_MEDIA_TYPES as readonly string[]).includes(info.contentType)) {
        throw new OnboardingError('INVALID', 'Upload a PNG, JPEG, WebP or MP4 file')
      }
      if (bytes.byteLength > ONBOARDING_MEDIA_MAX_BYTES)
        throw new OnboardingError('INVALID', 'File is larger than 20 MB')
      if (!info.size) throw new OnboardingError('INVALID', 'Could not read the pixel size of this file')
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const existing = await db.query.files.findFirst({
        where: and(eq(schema.files.projectId, projectId), eq(schema.files.sha256, sha256)),
      })
      if (existing) return toMediaFile(existing)
      const storageKey = `projects/${projectId}/${sha256}.${extensionFor(info.contentType)}`
      await deps.storage.put(storageKey, bytes, info.contentType)
      const [file] = await db
        .insert(schema.files)
        .values({
          projectId,
          storageKey,
          contentType: info.contentType,
          size: bytes.byteLength,
          width: info.size.width,
          height: info.size.height,
          sha256,
        })
        .returning()
      return toMediaFile(file!)
    },

    // ── Public, read-only ────────────────────────────────────────────────────

    /**
     * What the key's environment serves of `key`, in the language closest to `locale`.
     * Media URLs are made absolute against `publicBase`. `production` tells the caller
     * how long the answer may be cached.
     */
    async publicDocument(
      token: string,
      key: string,
      locale: string | undefined,
      publicBase: string,
    ): Promise<
      | { status: 401 }
      | { status: 404; production: boolean }
      | { status: 200; production: boolean; document: OnboardingDocument; etag: string }
    > {
      const env = await verifyApiKey(token)
      if (!env) return { status: 401 }
      const production = env.isProduction
      const o = await db.query.onboardings.findFirst({
        where: and(eq(schema.onboardings.projectId, env.projectId), eq(schema.onboardings.key, key)),
      })
      const release = o ? await servedRelease(o.id, env) : null
      if (!release) return { status: 404, production }
      const served = resolveOnboardingLocale(
        locale ?? release.defaultLocale,
        Object.keys(release.document),
        release.defaultLocale,
      )
      const stored = release.document[served]
      if (!stored) return { status: 404, production }
      const document = onboardingDocumentSchema.parse({
        ...stored,
        pages: stored.pages.map((page) =>
          page.media ? { ...page, media: page.media.map((m) => ({ ...m, url: `${publicBase}/${m.url}` })) } : page,
        ),
      })
      // The media base changes the body, so it is part of the representation's tag.
      const base = createHash('sha256').update(publicBase).digest('hex').slice(0, 8)
      return {
        status: 200,
        production,
        document,
        etag: `"${release.id.slice(0, 8)}.${release.revision}.${served}.${base}"`,
      }
    },

    /** A file some release refers to, by hash. Nothing else is served publicly. */
    async publicFile(sha256: string) {
      if (!/^[0-9a-f]{64}$/.test(sha256)) return null
      const [row] = await db
        .select({ file: schema.files })
        .from(schema.files)
        .innerJoin(schema.onboardingReleaseFiles, eq(schema.onboardingReleaseFiles.fileId, schema.files.id))
        .where(eq(schema.files.sha256, sha256))
        .limit(1)
      if (!row) return null
      const bytes = await deps.storage.get(row.file.storageKey)
      return bytes ? { file: row.file, bytes } : null
    },

    // ── Project API keys ─────────────────────────────────────────────────────

    async listApiKeys(projectId: string): Promise<ApiKey[]> {
      const rows = await db
        .select()
        .from(schema.projectApiKeys)
        .where(eq(schema.projectApiKeys.projectId, projectId))
        .orderBy(asc(schema.projectApiKeys.createdAt))
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        prefix: r.prefix,
        environmentId: r.environmentId,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
      }))
    },

    /** Returns the key once; only its hash is stored. */
    async createApiKey(projectId: string, userId: string, name: string, environmentId: string) {
      const env = await requireEnvironment(projectId, environmentId)
      const { token } = generateToken(24)
      const key = `${API_KEY_PREFIX}${token}`
      const [row] = await db
        .insert(schema.projectApiKeys)
        .values({
          projectId,
          environmentId: env.id,
          name,
          tokenHash: hashToken(key),
          prefix: key.slice(0, API_KEY_PREFIX.length + 6),
          createdBy: userId,
        })
        .returning()
      return {
        id: row!.id,
        name: row!.name,
        prefix: row!.prefix,
        environmentId: row!.environmentId,
        createdAt: row!.createdAt,
        token: key,
      }
    },

    async revokeApiKey(projectId: string, apiKeyId: string) {
      const [row] = await db
        .delete(schema.projectApiKeys)
        .where(and(eq(schema.projectApiKeys.id, apiKeyId), eq(schema.projectApiKeys.projectId, projectId)))
        .returning()
      if (!row) throw new OnboardingError('NOT_FOUND', 'API key not found')
    },
  }
}

export type OnboardingsService = ReturnType<typeof onboardingsService>
