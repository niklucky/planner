import { type Db, schema } from '@planner/db'
import { type NoteScope, type SaveReleaseNotesInput, compareVersions } from '@planner/shared'
import { and, eq, inArray } from 'drizzle-orm'
import type { integrationsService } from './integrations'
import { IntegrationError } from './integrations'

export interface ReleaseDeps {
  integrations: ReturnType<typeof integrationsService>
}

/** A store version linked to a release, with its app. */
export interface ReleaseVersion {
  id: string
  appId: string
  appName: string
  platform: 'ios' | 'android'
  storePlatform: string
  versionString: string
  state: string
  externalId: string
}

const versionColumns = {
  id: schema.appVersions.id,
  appId: schema.apps.id,
  appName: schema.apps.name,
  platform: schema.apps.platform,
  storePlatform: schema.appVersions.platform,
  versionString: schema.appVersions.versionString,
  state: schema.appVersions.state,
  externalId: schema.appVersions.externalId,
  releaseId: schema.appVersions.releaseId,
  integrationId: schema.apps.integrationId,
}

export function releasesService(db: Db, deps: ReleaseDeps) {
  async function requireRelease(projectId: string, releaseId: string) {
    const row = await db.query.releases.findFirst({
      where: and(eq(schema.releases.id, releaseId), eq(schema.releases.projectId, projectId)),
    })
    if (!row) throw new IntegrationError('NOT_FOUND', 'Release not found')
    return row
  }

  function versionsFor(releaseIds: string[]) {
    if (releaseIds.length === 0) return Promise.resolve([])
    return db
      .select(versionColumns)
      .from(schema.appVersions)
      .innerJoin(schema.apps, eq(schema.appVersions.appId, schema.apps.id))
      .where(inArray(schema.appVersions.releaseId, releaseIds))
  }

  return {
    /** Releases of the project, newest version first, with their linked store versions. */
    async listForProject(projectId: string) {
      const rows = await db.query.releases.findMany({ where: eq(schema.releases.projectId, projectId) })
      const versions = await versionsFor(rows.map((r) => r.id))
      return rows
        .map((r) => ({
          id: r.id,
          version: r.version,
          notesMode: r.notesMode,
          versions: versions.filter((v) => v.releaseId === r.id).map(({ releaseId: _r, integrationId: _i, ...v }) => v),
        }))
        .sort((a, b) => compareVersions(b.version, a.version))
    },

    async get(projectId: string, releaseId: string) {
      const release = await requireRelease(projectId, releaseId)
      const versions = await versionsFor([release.id])
      const notes = await db.query.releaseNotes.findMany({ where: eq(schema.releaseNotes.releaseId, release.id) })
      const localizations =
        versions.length === 0
          ? []
          : await db.query.appVersionLocalizations.findMany({
              where: inArray(
                schema.appVersionLocalizations.appVersionId,
                versions.map((v) => v.id),
              ),
            })
      return {
        id: release.id,
        version: release.version,
        notesMode: release.notesMode,
        updatedAt: release.updatedAt,
        versions: versions.map(({ releaseId: _r, integrationId: _i, ...v }) => v),
        notes: notes.map((n) => ({ scope: n.scope, locale: n.locale, text: n.text, updatedAt: n.updatedAt })),
        storeLocalizations: localizations.map((l) => ({
          appVersionId: l.appVersionId,
          locale: l.locale,
          whatsNew: l.whatsNew,
          syncedAt: l.syncedAt,
        })),
      }
    },

    /** Replaces the release's notes and mode with the given set. */
    async saveNotes(projectId: string, input: SaveReleaseNotesInput) {
      const release = await requireRelease(projectId, input.releaseId)
      const now = new Date()
      await db.transaction(async (tx) => {
        await tx
          .update(schema.releases)
          .set({ notesMode: input.notesMode, updatedAt: now })
          .where(eq(schema.releases.id, release.id))
        await tx.delete(schema.releaseNotes).where(eq(schema.releaseNotes.releaseId, release.id))
        const rows = input.notes
          .filter((n) => n.text.trim().length > 0)
          .map((n) => ({ releaseId: release.id, scope: n.scope, locale: n.locale, text: n.text, updatedAt: now }))
        if (rows.length > 0) await tx.insert(schema.releaseNotes).values(rows)
      })
      return this.get(projectId, release.id)
    },

    /**
     * Pulls "What's New" for every store version in the release and copies it
     * into the release notes, overwriting local text for those locales.
     */
    async pullNotes(projectId: string, releaseId: string) {
      const release = await requireRelease(projectId, releaseId)
      const versions = await versionsFor([release.id])
      const now = new Date()
      for (const v of versions) {
        if (!v.integrationId || v.platform !== 'ios') continue
        const client = await deps.integrations.appStoreClientFor(projectId, v.integrationId)
        let remote: Awaited<ReturnType<typeof client.listVersionLocalizations>>
        try {
          remote = await client.listVersionLocalizations(v.externalId)
        } catch (e) {
          throw new IntegrationError('VERIFICATION_FAILED', (e as Error).message)
        }
        const scope: NoteScope = release.notesMode === 'shared' ? 'shared' : v.platform
        await db.transaction(async (tx) => {
          for (const l of remote) {
            await tx
              .insert(schema.appVersionLocalizations)
              .values({ appVersionId: v.id, externalId: l.id, locale: l.locale, whatsNew: l.whatsNew, syncedAt: now })
              .onConflictDoUpdate({
                target: [schema.appVersionLocalizations.appVersionId, schema.appVersionLocalizations.locale],
                set: { externalId: l.id, whatsNew: l.whatsNew, syncedAt: now },
              })
            if (l.whatsNew) {
              await tx
                .insert(schema.releaseNotes)
                .values({ releaseId: release.id, scope, locale: l.locale, text: l.whatsNew, updatedAt: now })
                .onConflictDoUpdate({
                  target: [schema.releaseNotes.releaseId, schema.releaseNotes.scope, schema.releaseNotes.locale],
                  set: { text: l.whatsNew, updatedAt: now },
                })
            }
          }
        })
      }
      return this.get(projectId, release.id)
    },
  }
}
