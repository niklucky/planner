import { type Db, schema } from '@planner/db'
import {
  compareVersions,
  type PushPlanVersion,
  planPush,
  resolveNoteScope,
  type SaveReleaseNotesInput,
} from '@planner/shared'
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
  appExternalId: schema.apps.externalId,
}

function toSnapshotVersion(v: {
  id: string
  externalId: string
  integrationId: string | null
  platform: 'ios' | 'android'
  storePlatform: string
  versionString: string
  appExternalId: string | null
}): SnapshotVersionInput | null {
  if (!v.integrationId || !v.appExternalId) return null
  return { ...v, integrationId: v.integrationId, appExternalId: v.appExternalId }
}

interface SnapshotVersionInput {
  id: string
  externalId: string
  integrationId: string
  platform: 'ios' | 'android'
  storePlatform: string
  versionString: string
  appExternalId: string
}

export interface PushResult extends PushPlanVersion {
  /** Locales written to the store in this run. */
  pushed: string[]
  /** First error encountered; remaining locales for that version were not sent. */
  error: string | null
}

export function releasesService(db: Db, deps: ReleaseDeps) {
  async function requireRelease(projectId: string, releaseId: string) {
    const row = await db.query.releases.findFirst({
      where: and(eq(schema.releases.id, releaseId), eq(schema.releases.projectId, projectId)),
    })
    if (!row) throw new IntegrationError('NOT_FOUND', 'Release not found')
    return row
  }

  type SnapshotVersion = {
    id: string
    externalId: string
    integrationId: string
    platform: 'ios' | 'android'
    storePlatform: string
    versionString: string
    appExternalId: string
  }

  /** Pulls the store's per-locale notes for a version into the local snapshot and returns them. */
  async function snapshotLocalizations(projectId: string, v: SnapshotVersion) {
    let remote: Array<{ id: string; locale: string; whatsNew: string | null }>
    try {
      if (v.platform === 'ios') {
        const client = await deps.integrations.appStoreClientFor(projectId, v.integrationId)
        remote = await client.listVersionLocalizations(v.externalId)
      } else {
        const client = await deps.integrations.googlePlayClientFor(projectId, v.integrationId)
        const notes = await client.getReleaseNotes(v.appExternalId, v.storePlatform, v.versionString)
        remote = notes.map((n) => ({ id: n.language, locale: n.language, whatsNew: n.text }))
      }
    } catch (e) {
      throw new IntegrationError('VERIFICATION_FAILED', (e as Error).message)
    }
    const now = new Date()
    for (const l of remote) {
      // Google Play returns notes wrapped in line breaks; store them as authored.
      const whatsNew = l.whatsNew?.trim() ?? null
      await db
        .insert(schema.appVersionLocalizations)
        .values({ appVersionId: v.id, externalId: l.id, locale: l.locale, whatsNew, syncedAt: now })
        .onConflictDoUpdate({
          target: [schema.appVersionLocalizations.appVersionId, schema.appVersionLocalizations.locale],
          set: { externalId: l.id, whatsNew, syncedAt: now },
        })
    }
    return db.query.appVersionLocalizations.findMany({ where: eq(schema.appVersionLocalizations.appVersionId, v.id) })
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
    /** Releases of the project grouped by app group, newest version first. */
    async listForProject(projectId: string) {
      const rows = await db
        .select({ release: schema.releases, groupName: schema.appGroups.name })
        .from(schema.releases)
        .innerJoin(schema.appGroups, eq(schema.releases.groupId, schema.appGroups.id))
        .where(eq(schema.releases.projectId, projectId))
      const versions = await versionsFor(rows.map((r) => r.release.id))
      return rows
        .map(({ release: r, groupName }) => ({
          id: r.id,
          version: r.version,
          groupId: r.groupId,
          groupName,
          notesMode: r.notesMode,
          versions: versions
            .filter((v) => v.releaseId === r.id)
            .map(({ releaseId: _r, integrationId: _i, appExternalId: _e, ...v }) => v),
        }))
        .sort((a, b) => a.groupName.localeCompare(b.groupName) || compareVersions(b.version, a.version))
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
        versions: versions.map(({ releaseId: _r, integrationId: _i, appExternalId: _e, ...v }) => v),
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
          .map((n) => ({
            releaseId: release.id,
            scope: n.scope,
            locale: n.locale,
            text: n.text.trim(),
            updatedAt: now,
          }))
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
        const sv = toSnapshotVersion(v)
        if (!sv) continue
        const locs = await snapshotLocalizations(projectId, sv)
        const scope = resolveNoteScope(release.notesMode, v.platform)
        for (const l of locs) {
          if (!l.whatsNew) continue
          await db
            .insert(schema.releaseNotes)
            .values({ releaseId: release.id, scope, locale: l.locale, text: l.whatsNew, updatedAt: now })
            .onConflictDoUpdate({
              target: [schema.releaseNotes.releaseId, schema.releaseNotes.scope, schema.releaseNotes.locale],
              set: { text: l.whatsNew, updatedAt: now },
            })
        }
      }
      return this.get(projectId, release.id)
    },

    /**
     * Writes our notes to every editable App Store version in the release.
     * Only locales whose text differs from the store snapshot are sent.
     */
    async pushNotes(projectId: string, releaseId: string) {
      const release = await requireRelease(projectId, releaseId)
      const versions = await versionsFor([release.id])
      const notes = await db.query.releaseNotes.findMany({ where: eq(schema.releaseNotes.releaseId, release.id) })

      // Make sure every editable version has a snapshot (we need localization ids).
      const store = new Map<string, Awaited<ReturnType<typeof snapshotLocalizations>>>()
      for (const v of versions) {
        const sv = toSnapshotVersion(v)
        if (!sv) continue
        let locs = await db.query.appVersionLocalizations.findMany({
          where: eq(schema.appVersionLocalizations.appVersionId, v.id),
        })
        if (locs.length === 0) locs = await snapshotLocalizations(projectId, sv)
        store.set(v.id, locs)
      }

      const plans = planPush({
        notesMode: release.notesMode,
        notes,
        versions,
        storeLocalizations: [...store.values()].flat(),
      })

      const results: PushResult[] = []
      for (const plan of plans) {
        const result: PushResult = { ...plan, pushed: [], error: null }
        results.push(result)
        if (!plan.editable || plan.changes.length === 0) continue
        const v = toSnapshotVersion(versions.find((x) => x.id === plan.appVersionId)!)
        if (!v) continue
        const locs = store.get(v.id)!
        const markPushed = (locales: Array<{ locale: string; to: string }>) =>
          Promise.all(
            locales.map((c) =>
              db
                .update(schema.appVersionLocalizations)
                .set({ whatsNew: c.to, syncedAt: new Date() })
                .where(eq(schema.appVersionLocalizations.id, locs.find((l) => l.locale === c.locale)!.id)),
            ),
          )

        if (v.platform === 'ios') {
          const client = await deps.integrations.appStoreClientFor(projectId, v.integrationId)
          for (const change of plan.changes) {
            const loc = locs.find((l) => l.locale === change.locale)!
            try {
              await client.updateVersionLocalization(loc.externalId, { whatsNew: change.to })
            } catch (e) {
              result.error = `${change.locale}: ${(e as Error).message}`
              break
            }
            await markPushed([change])
            result.pushed.push(change.locale)
          }
        } else {
          // Google Play takes all languages of a release in one committed edit.
          const client = await deps.integrations.googlePlayClientFor(projectId, v.integrationId)
          try {
            await client.updateReleaseNotes(
              v.appExternalId,
              v.storePlatform,
              v.versionString,
              plan.changes.map((c) => ({ language: c.locale, text: c.to })),
            )
            await markPushed(plan.changes)
            result.pushed.push(...plan.changes.map((c) => c.locale))
          } catch (e) {
            result.error = (e as Error).message
          }
        }
      }
      return results
    },
  }
}
