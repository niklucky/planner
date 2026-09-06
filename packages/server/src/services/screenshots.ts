import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import { type Db, schema } from '@planner/db'
import {
  SCREENSHOTS_PER_SET_LIMIT,
  SCREENSHOT_CONTENT_TYPES,
  SCREENSHOT_MAX_BYTES,
  type Screenshot,
  type ScreenshotPushPlanVersion,
  type ScreenshotPushResultVersion,
  type ScreenshotSlot,
  type ScreenshotSlotPlan,
  isVersionEditable,
} from '@planner/shared'
import { and, asc, eq, inArray, max } from 'drizzle-orm'
import { contentTypeFor, imageSize } from '../images/size'
import type { AppStoreClient } from '../integrations/app-store/client'
import type { Storage } from '../storage'
import { IntegrationError } from './integrations'
import type { integrationsService } from './integrations'

export interface ScreenshotDeps {
  storage: Storage
  integrations: ReturnType<typeof integrationsService>
}

export interface UploadedFile {
  name: string
  bytes: Uint8Array
}

const extFor = (contentType: string) => (contentType === 'image/png' ? 'png' : 'jpg')

export function fileUrl(fileId: string) {
  return `/api/files/${fileId}`
}

export function screenshotsService(db: Db, deps: ScreenshotDeps) {
  async function requireRelease(projectId: string, releaseId: string) {
    const row = await db.query.releases.findFirst({
      where: and(eq(schema.releases.id, releaseId), eq(schema.releases.projectId, projectId)),
    })
    if (!row) throw new IntegrationError('NOT_FOUND', 'Release not found')
    return row
  }

  /** Stores bytes once per project (by sha256) and returns the file row. */
  async function storeFile(projectId: string, bytes: Uint8Array) {
    const contentType = contentTypeFor(bytes)
    if (!contentType || !(SCREENSHOT_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      throw new IntegrationError('VERIFICATION_FAILED', 'Only PNG and JPEG images are supported')
    }
    if (bytes.byteLength > SCREENSHOT_MAX_BYTES) {
      throw new IntegrationError('VERIFICATION_FAILED', 'Image is larger than 20 MB')
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const existing = await db.query.files.findFirst({
      where: and(eq(schema.files.projectId, projectId), eq(schema.files.sha256, sha256)),
    })
    if (existing) return existing
    const size = imageSize(bytes)
    const storageKey = `projects/${projectId}/${sha256}.${extFor(contentType)}`
    await deps.storage.put(storageKey, bytes, contentType)
    const [file] = await db
      .insert(schema.files)
      .values({ projectId, storageKey, contentType, size: bytes.byteLength, width: size?.width, height: size?.height, sha256 })
      .returning()
    return file!
  }

  async function nextPosition(releaseId: string, slot: ScreenshotSlot) {
    const [row] = await db
      .select({ max: max(schema.screenshots.position) })
      .from(schema.screenshots)
      .where(
        and(
          eq(schema.screenshots.releaseId, releaseId),
          eq(schema.screenshots.platform, slot.platform),
          eq(schema.screenshots.locale, slot.locale),
          eq(schema.screenshots.deviceType, slot.deviceType),
        ),
      )
    return (row?.max ?? -1) + 1
  }

  function toPublic(s: typeof schema.screenshots.$inferSelect, f: typeof schema.files.$inferSelect): Screenshot {
    return {
      id: s.id,
      releaseId: s.releaseId,
      platform: s.platform,
      locale: s.locale,
      deviceType: s.deviceType,
      position: s.position,
      fileId: s.fileId,
      url: fileUrl(f.id),
      width: f.width,
      height: f.height,
      storeExternalId: s.storeExternalId,
    }
  }

  /** Deletes file rows (and bytes) no screenshot references any more. */
  async function pruneFiles(fileIds: string[]) {
    for (const fileId of new Set(fileIds)) {
      const stillUsed = await db.query.screenshots.findFirst({ where: eq(schema.screenshots.fileId, fileId) })
      if (stillUsed) continue
      const file = await db.query.files.findFirst({ where: eq(schema.files.id, fileId) })
      if (!file) continue
      await db.delete(schema.files).where(eq(schema.files.id, fileId))
      await deps.storage.delete(file.storageKey).catch(() => {})
    }
  }


  /** Concrete operations for one (locale, deviceType) slot, from local rows and the remote set. */
  type SlotWork = {
    plan: ScreenshotSlotPlan
    localizationId: string
    setId: string | null
    local: Array<typeof schema.screenshots.$inferSelect>
    toDelete: string[]
    toUpload: Array<typeof schema.screenshots.$inferSelect>
    finalOrderKnown: boolean
  }

  async function slotWorkFor(
    client: AppStoreClient,
    releaseId: string,
    locs: Array<{ externalId: string; locale: string }>,
  ): Promise<SlotWork[]> {
    const local = await db.query.screenshots.findMany({
      where: and(eq(schema.screenshots.releaseId, releaseId), eq(schema.screenshots.platform, 'ios')),
      orderBy: [asc(schema.screenshots.position)],
    })
    const localesWithShots = new Set(local.map((l) => l.locale))
    const work: SlotWork[] = []
    for (const loc of locs) {
      if (!localesWithShots.has(loc.locale)) continue
      const remoteSets = await client.listScreenshotSets(loc.externalId)
      const deviceTypes = new Set([
        ...local.filter((l) => l.locale === loc.locale).map((l) => l.deviceType),
        ...remoteSets.map((s) => s.displayType),
      ])
      for (const deviceType of deviceTypes) {
        const set = remoteSets.find((s) => s.displayType === deviceType) ?? null
        const mine = local.filter((l) => l.locale === loc.locale && l.deviceType === deviceType)
        const remote = set?.screenshots ?? []
        const remoteIds = new Set(remote.map((r) => r.id))
        const toUpload = mine.filter((l) => !l.storeExternalId || !remoteIds.has(l.storeExternalId))
        const keptIds = new Set(mine.map((l) => l.storeExternalId).filter((id): id is string => !!id && remoteIds.has(id)))
        const toDelete = remote.map((r) => r.id).filter((id) => !keptIds.has(id))
        const sameOrder =
          toUpload.length === 0 &&
          toDelete.length === 0 &&
          remote.map((r) => r.id).join() === mine.map((l) => l.storeExternalId).join()
        const plan: ScreenshotSlotPlan = {
          locale: loc.locale,
          deviceType,
          createSet: !set && mine.length > 0,
          uploads: toUpload.length,
          deletes: toDelete.length,
          reorder: !sameOrder && mine.length > 0,
          overLimit: mine.length > SCREENSHOTS_PER_SET_LIMIT,
        }
        if (plan.createSet || plan.uploads || plan.deletes || plan.reorder) {
          work.push({ plan, localizationId: loc.externalId, setId: set?.id ?? null, local: mine, toDelete, toUpload, finalOrderKnown: true })
        }
      }
    }
    return work
  }

  /** iOS store versions of the release with their app and localizations (snapshotting if needed). */
  async function iosVersions(projectId: string, releaseId: string) {
    const rows = await db
      .select({ v: schema.appVersions, app: schema.apps })
      .from(schema.appVersions)
      .innerJoin(schema.apps, eq(schema.appVersions.appId, schema.apps.id))
      .where(and(eq(schema.appVersions.releaseId, releaseId), eq(schema.apps.platform, 'ios')))
    const out: Array<{ v: (typeof rows)[number]['v']; app: (typeof rows)[number]['app']; client: AppStoreClient; locs: Array<{ externalId: string; locale: string }> }> = []
    for (const { v, app } of rows) {
      if (!app.integrationId) continue
      const client = await deps.integrations.appStoreClientFor(projectId, app.integrationId)
      let locs = await db.query.appVersionLocalizations.findMany({ where: eq(schema.appVersionLocalizations.appVersionId, v.id) })
      if (locs.length === 0) {
        const remote = await client.listVersionLocalizations(v.externalId).catch((e: Error) => {
          throw new IntegrationError('VERIFICATION_FAILED', e.message)
        })
        if (remote.length > 0) {
          await db
            .insert(schema.appVersionLocalizations)
            .values(remote.map((l) => ({ appVersionId: v.id, externalId: l.id, locale: l.locale, whatsNew: l.whatsNew })))
            .onConflictDoNothing()
        }
        locs = await db.query.appVersionLocalizations.findMany({ where: eq(schema.appVersionLocalizations.appVersionId, v.id) })
      }
      out.push({ v, app, client, locs })
    }
    return out
  }

  return {
    async listForRelease(projectId: string, releaseId: string): Promise<Screenshot[]> {
      await requireRelease(projectId, releaseId)
      const rows = await db
        .select({ s: schema.screenshots, f: schema.files })
        .from(schema.screenshots)
        .innerJoin(schema.files, eq(schema.screenshots.fileId, schema.files.id))
        .where(eq(schema.screenshots.releaseId, releaseId))
        .orderBy(asc(schema.screenshots.locale), asc(schema.screenshots.deviceType), asc(schema.screenshots.position))
      return rows.map(({ s, f }) => toPublic(s, f))
    },

    /** Appends uploaded images to a slot, in the order given. */
    async add(projectId: string, releaseId: string, slot: ScreenshotSlot, uploads: UploadedFile[]) {
      await requireRelease(projectId, releaseId)
      let position = await nextPosition(releaseId, slot)
      const created: Screenshot[] = []
      for (const upload of uploads) {
        const file = await storeFile(projectId, upload.bytes)
        const [row] = await db
          .insert(schema.screenshots)
          .values({ releaseId, ...slot, position: position++, fileId: file.id })
          .returning()
        created.push(toPublic(row!, file))
      }
      return created
    },

    async remove(projectId: string, screenshotId: string) {
      const [row] = await db
        .select({ s: schema.screenshots })
        .from(schema.screenshots)
        .innerJoin(schema.releases, eq(schema.screenshots.releaseId, schema.releases.id))
        .where(and(eq(schema.screenshots.id, screenshotId), eq(schema.releases.projectId, projectId)))
      if (!row) throw new IntegrationError('NOT_FOUND', 'Screenshot not found')
      await db.delete(schema.screenshots).where(eq(schema.screenshots.id, row.s.id))
      await pruneFiles([row.s.fileId])
    },

    /** Serves a file to a project member. */
    async getFile(projectId: string, fileId: string) {
      const file = await db.query.files.findFirst({
        where: and(eq(schema.files.id, fileId), eq(schema.files.projectId, projectId)),
      })
      if (!file) return null
      const bytes = await deps.storage.get(file.storageKey)
      return bytes ? { file, bytes } : null
    },

    /** What a push would do, per editable iOS version. Read-only. */
    async planAppStorePush(projectId: string, releaseId: string): Promise<ScreenshotPushPlanVersion[]> {
      const release = await requireRelease(projectId, releaseId)
      const plans: ScreenshotPushPlanVersion[] = []
      for (const { v, app, client, locs } of await iosVersions(projectId, release.id)) {
        const editable = isVersionEditable('ios', v.state)
        const base = { appVersionId: v.id, appName: app.name, versionString: v.versionString, state: v.state, editable }
        if (!editable) {
          plans.push({ ...base, slots: [] })
          continue
        }
        const work = await slotWorkFor(client, release.id, locs).catch((e: Error) => {
          throw new IntegrationError('VERIFICATION_FAILED', e.message)
        })
        plans.push({ ...base, slots: work.map((w) => w.plan) })
      }
      return plans
    },

    /** Makes App Store Connect match our screenshots for every editable iOS version. */
    async pushToAppStore(projectId: string, releaseId: string): Promise<ScreenshotPushResultVersion[]> {
      const release = await requireRelease(projectId, releaseId)
      const results: ScreenshotPushResultVersion[] = []
      for (const { v, app, client, locs } of await iosVersions(projectId, release.id)) {
        const editable = isVersionEditable('ios', v.state)
        const result: ScreenshotPushResultVersion = {
          appVersionId: v.id,
          appName: app.name,
          versionString: v.versionString,
          state: v.state,
          editable,
          slots: [],
          uploaded: 0,
          deleted: 0,
          error: null,
        }
        results.push(result)
        if (!editable) continue
        let work: SlotWork[]
        try {
          work = await slotWorkFor(client, release.id, locs)
        } catch (e) {
          result.error = (e as Error).message
          continue
        }
        result.slots = work.map((w) => w.plan)
        for (const slot of work) {
          try {
            if (slot.plan.overLimit) {
              throw new Error(`${slot.plan.locale} ${slot.plan.deviceType}: more than ${SCREENSHOTS_PER_SET_LIMIT} screenshots`)
            }
            let setId = slot.setId
            if (!setId) setId = (await client.createScreenshotSet(slot.localizationId, slot.plan.deviceType)).id

            for (const id of slot.toDelete) {
              await client.deleteScreenshot(id)
              result.deleted++
            }

            for (const row of slot.toUpload) {
              const file = await db.query.files.findFirst({ where: eq(schema.files.id, row.fileId) })
              const bytes = file ? await deps.storage.get(file.storageKey) : null
              if (!file || !bytes) throw new Error('Stored image is missing')
              const fileName = `${basename(file.storageKey)}`
              const reserved = await client.createScreenshot(setId, fileName, bytes.byteLength)
              await client.performUploadOperations(reserved.uploadOperations, bytes)
              await client.commitScreenshot(reserved.id, createHash('md5').update(bytes).digest('hex'))
              await db
                .update(schema.screenshots)
                .set({ storeExternalId: reserved.id, storeSetId: setId, syncedAt: new Date(), updatedAt: new Date() })
                .where(eq(schema.screenshots.id, row.id))
              row.storeExternalId = reserved.id
              result.uploaded++
            }

            if (slot.local.length > 0) {
              await client.reorderScreenshotSet(
                setId,
                slot.local.map((l) => l.storeExternalId).filter((id): id is string => !!id),
              )
              await db
                .update(schema.screenshots)
                .set({ storeSetId: setId, syncedAt: new Date() })
                .where(inArray(schema.screenshots.id, slot.local.map((l) => l.id)))
            }
          } catch (e) {
            result.error = `${slot.plan.locale} ${slot.plan.deviceType}: ${(e as Error).message}`
            break
          }
        }
      }
      return results
    },

    /**
     * Replaces the release's iOS screenshots with what App Store Connect has for
     * each store version in the release, downloading the images into our storage.
     */
    async pullFromAppStore(projectId: string, releaseId: string) {
      const release = await requireRelease(projectId, releaseId)
      const versions = await db
        .select({ v: schema.appVersions, app: schema.apps })
        .from(schema.appVersions)
        .innerJoin(schema.apps, eq(schema.appVersions.appId, schema.apps.id))
        .where(and(eq(schema.appVersions.releaseId, release.id), eq(schema.apps.platform, 'ios')))

      let imported = 0
      for (const { v, app } of versions) {
        if (!app.integrationId) continue
        const client = await deps.integrations.appStoreClientFor(projectId, app.integrationId)
        let locs = await db.query.appVersionLocalizations.findMany({
          where: eq(schema.appVersionLocalizations.appVersionId, v.id),
        })
        if (locs.length === 0) {
          const remote = await client.listVersionLocalizations(v.externalId).catch((e: Error) => {
            throw new IntegrationError('VERIFICATION_FAILED', e.message)
          })
          await db
            .insert(schema.appVersionLocalizations)
            .values(remote.map((l) => ({ appVersionId: v.id, externalId: l.id, locale: l.locale, whatsNew: l.whatsNew })))
            .onConflictDoNothing()
          locs = await db.query.appVersionLocalizations.findMany({
            where: eq(schema.appVersionLocalizations.appVersionId, v.id),
          })
        }

        for (const loc of locs) {
          const sets = await client.listScreenshotSets(loc.externalId).catch((e: Error) => {
            throw new IntegrationError('VERIFICATION_FAILED', e.message)
          })
          for (const set of sets) {
            const slot: ScreenshotSlot = { platform: 'ios', locale: loc.locale, deviceType: set.displayType }
            // Replace whatever we had for this slot.
            const old = await db
              .delete(schema.screenshots)
              .where(
                and(
                  eq(schema.screenshots.releaseId, release.id),
                  eq(schema.screenshots.platform, slot.platform),
                  eq(schema.screenshots.locale, slot.locale),
                  eq(schema.screenshots.deviceType, slot.deviceType),
                ),
              )
              .returning({ fileId: schema.screenshots.fileId })
            let position = 0
            for (const shot of set.screenshots) {
              if (!shot.url) continue
              const res = await fetch(shot.url)
              if (!res.ok) throw new IntegrationError('VERIFICATION_FAILED', `Could not download ${shot.fileName} (${res.status})`)
              const file = await storeFile(projectId, new Uint8Array(await res.arrayBuffer()))
              await db.insert(schema.screenshots).values({
                releaseId: release.id,
                ...slot,
                position: position++,
                fileId: file.id,
                storeExternalId: shot.id,
                storeSetId: set.id,
                syncedAt: new Date(),
              })
              imported++
            }
            await pruneFiles(old.map((o) => o.fileId))
          }
        }
      }
      return { imported }
    },
  }
}
