import { type Db, schema } from '@planner/db'
import type {
  AppStoreCredentials,
  GooglePlayCredentialsInput,
  ImportAppInput,
  ImportGooglePlayAppInput,
  Integration,
  RemoteApp,
  RemoteVersion,
  TranslationSettings,
} from '@planner/shared'
import { translationLabel } from '@planner/shared'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { SecretBox } from '../crypto/secret-box'

type IntegrationRow = typeof schema.integrations.$inferSelect
import { AppStoreError, createAppStoreClient } from '../integrations/app-store/client'
import { type GoogleServiceAccount, parseServiceAccount } from '../integrations/google-play/auth'
import { GooglePlayError, createGooglePlayClient } from '../integrations/google-play/client'
import { linkVersionsToReleases } from '../releases/link'
import { TranslationError, createTranslator } from '../translation'

export type IntegrationErrorCode = 'NOT_FOUND' | 'VERIFICATION_FAILED' | 'ALREADY_IMPORTED' | 'NOT_LINKED'

export class IntegrationError extends Error {
  constructor(
    public readonly code: IntegrationErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'IntegrationError'
  }
}

export interface IntegrationDeps {
  secretBox: SecretBox
}

function toPublic(row: IntegrationRow): Integration {
  return {
    id: row.id,
    projectId: row.projectId,
    provider: row.provider,
    status: row.status,
    lastError: row.lastError,
    lastVerifiedAt: row.lastVerifiedAt,
    metadata: row.metadata,
    createdAt: row.createdAt,
  }
}

function describe(e: unknown) {
  if (e instanceof AppStoreError || e instanceof GooglePlayError || e instanceof TranslationError) return e.message
  return `Unexpected error: ${(e as Error).message}`
}

export function integrationsService(db: Db, deps: IntegrationDeps) {
  async function requireRow(projectId: string, integrationId: string) {
    const row = await db.query.integrations.findFirst({
      where: and(eq(schema.integrations.id, integrationId), eq(schema.integrations.projectId, projectId)),
    })
    if (!row) throw new IntegrationError('NOT_FOUND', 'Integration not found')
    return row
  }

  function appStoreClient(row: IntegrationRow) {
    if (row.provider !== 'app_store') throw new IntegrationError('NOT_FOUND', 'Not an App Store integration')
    const creds = JSON.parse(deps.secretBox.open(row.credentials)) as AppStoreCredentials
    return createAppStoreClient(creds)
  }

  function googlePlayClient(row: IntegrationRow) {
    if (row.provider !== 'google_play') throw new IntegrationError('NOT_FOUND', 'Not a Google Play integration')
    const sa = JSON.parse(deps.secretBox.open(row.credentials)) as GoogleServiceAccount
    return createGooglePlayClient(sa)
  }

  function translator(row: IntegrationRow) {
    if (row.provider !== 'translation') throw new IntegrationError('NOT_FOUND', 'Not a translation integration')
    return createTranslator(JSON.parse(deps.secretBox.open(row.credentials)) as TranslationSettings)
  }

  async function createGroup(projectId: string, name: string) {
    const [group] = await db.insert(schema.appGroups).values({ projectId, name }).returning()
    return group!
  }

  return {
    async listForProject(projectId: string): Promise<Integration[]> {
      const rows = await db.query.integrations.findMany({
        where: eq(schema.integrations.projectId, projectId),
        orderBy: schema.integrations.createdAt,
      })
      return rows.map(toPublic)
    },

    /**
     * Verifies the key against Apple, then stores it encrypted.
     * Nothing is stored when verification fails.
     */
    async connectAppStore(projectId: string, creds: AppStoreCredentials): Promise<Integration> {
      let apps: RemoteApp[]
      try {
        apps = await createAppStoreClient(creds).listApps()
      } catch (e) {
        throw new IntegrationError('VERIFICATION_FAILED', describe(e))
      }
      const now = new Date()
      const values = {
        credentials: deps.secretBox.seal(JSON.stringify(creds)),
        metadata: { issuerId: creds.issuerId, keyId: creds.keyId, appCount: String(apps.length) },
        status: 'connected' as const,
        lastError: null,
        lastVerifiedAt: now,
        updatedAt: now,
      }
      const [row] = await db
        .insert(schema.integrations)
        .values({ projectId, provider: 'app_store', ...values })
        .onConflictDoUpdate({ target: [schema.integrations.projectId, schema.integrations.provider], set: values })
        .returning()
      return toPublic(row!)
    },

    /** Verifies the service account can obtain a token, then stores it encrypted. */
    async connectGooglePlay(projectId: string, input: GooglePlayCredentialsInput): Promise<Integration> {
      let sa: GoogleServiceAccount
      try {
        sa = parseServiceAccount(input.serviceAccountJson)
        await createGooglePlayClient(sa).verify()
      } catch (e) {
        throw new IntegrationError('VERIFICATION_FAILED', describe(e))
      }
      const now = new Date()
      const values = {
        credentials: deps.secretBox.seal(JSON.stringify(sa)),
        metadata: { clientEmail: sa.client_email },
        status: 'connected' as const,
        lastError: null,
        lastVerifiedAt: now,
        updatedAt: now,
      }
      const [row] = await db
        .insert(schema.integrations)
        .values({ projectId, provider: 'google_play', ...values })
        .onConflictDoUpdate({ target: [schema.integrations.projectId, schema.integrations.provider], set: values })
        .returning()
      return toPublic(row!)
    },

    /** Verifies the translation provider key, then stores it encrypted. */
    async connectTranslation(projectId: string, settings: TranslationSettings): Promise<Integration> {
      try {
        await createTranslator(settings).verify()
      } catch (e) {
        throw new IntegrationError('VERIFICATION_FAILED', describe(e))
      }
      const now = new Date()
      const metadata: Record<string, string> =
        settings.kind === 'llm' ? { kind: 'llm', model: settings.model } : { kind: 'deepl', plan: settings.plan }
      metadata.label = translationLabel(settings)
      const values = {
        credentials: deps.secretBox.seal(JSON.stringify(settings)),
        metadata,
        status: 'connected' as const,
        lastError: null,
        lastVerifiedAt: now,
        updatedAt: now,
      }
      const [row] = await db
        .insert(schema.integrations)
        .values({ projectId, provider: 'translation', ...values })
        .onConflictDoUpdate({ target: [schema.integrations.projectId, schema.integrations.provider], set: values })
        .returning()
      return toPublic(row!)
    },

    /** The project's translator, or null when translation isn't set up. */
    async translatorFor(projectId: string) {
      const row = await db.query.integrations.findFirst({
        where: and(eq(schema.integrations.projectId, projectId), eq(schema.integrations.provider, 'translation')),
      })
      return row ? translator(row) : null
    },

    /** Re-checks the stored key and records the outcome. */
    async verify(projectId: string, integrationId: string): Promise<Integration> {
      const row = await requireRow(projectId, integrationId)
      const now = new Date()
      let update: Partial<typeof schema.integrations.$inferInsert>
      try {
        if (row.provider === 'app_store') {
          const apps = await appStoreClient(row).listApps()
          update = { status: 'connected', lastError: null, lastVerifiedAt: now, metadata: { ...row.metadata, appCount: String(apps.length) } }
        } else if (row.provider === 'google_play') {
          await googlePlayClient(row).verify()
          update = { status: 'connected', lastError: null, lastVerifiedAt: now }
        } else {
          await translator(row).verify()
          update = { status: 'connected', lastError: null, lastVerifiedAt: now }
        }
      } catch (e) {
        update = { status: 'error', lastError: describe(e) }
      }
      const [updated] = await db
        .update(schema.integrations)
        .set({ ...update, updatedAt: now })
        .where(eq(schema.integrations.id, row.id))
        .returning()
      return toPublic(updated!)
    },

    /** Apps visible to the stored key, straight from the store. */
    async listRemoteApps(projectId: string, integrationId: string): Promise<RemoteApp[]> {
      const row = await requireRow(projectId, integrationId)
      try {
        return await appStoreClient(row).listApps()
      } catch (e) {
        throw new IntegrationError('VERIFICATION_FAILED', describe(e))
      }
    },

    /** Creates a project app from the store's record of it. */
    async importApp(projectId: string, input: ImportAppInput) {
      const row = await requireRow(projectId, input.integrationId)
      let remote: RemoteApp
      try {
        remote = await appStoreClient(row).getApp(input.externalId)
      } catch (e) {
        throw new IntegrationError('VERIFICATION_FAILED', describe(e))
      }
      const group = await createGroup(projectId, remote.name)
      const [app] = await db
        .insert(schema.apps)
        .values({
          projectId,
          groupId: group.id,
          integrationId: row.id,
          externalId: remote.id,
          name: remote.name,
          platform: 'ios',
          bundleId: remote.bundleId,
        })
        .onConflictDoNothing({ target: [schema.apps.integrationId, schema.apps.externalId] })
        .returning()
      if (!app) {
        await db.delete(schema.appGroups).where(eq(schema.appGroups.id, group.id))
        throw new IntegrationError('ALREADY_IMPORTED', 'This app is already in the project')
      }
      // Best effort: versions can always be synced again from the UI.
      await this.syncVersions(projectId, app.id).catch((e: unknown) =>
        console.warn(`version sync after import failed for app ${app.id}:`, (e as Error).message),
      )
      return app
    },

    /** Adds a Google Play app by package name, in a group of its own. */
    async importGooglePlayApp(projectId: string, input: ImportGooglePlayAppInput) {
      const row = await requireRow(projectId, input.integrationId)
      let info: Awaited<ReturnType<ReturnType<typeof googlePlayClient>['getAppInfo']>>
      try {
        info = await googlePlayClient(row).getAppInfo(input.packageName)
      } catch (e) {
        throw new IntegrationError('VERIFICATION_FAILED', describe(e))
      }
      const group = await createGroup(projectId, info.title)
      const [app] = await db
        .insert(schema.apps)
        .values({
          projectId,
          groupId: group.id,
          integrationId: row.id,
          externalId: info.packageName,
          name: info.title,
          platform: 'android',
          bundleId: info.packageName,
        })
        .onConflictDoNothing({ target: [schema.apps.integrationId, schema.apps.externalId] })
        .returning()
      if (!app) {
        await db.delete(schema.appGroups).where(eq(schema.appGroups.id, group.id))
        throw new IntegrationError('ALREADY_IMPORTED', 'This app is already in the project')
      }
      await this.syncVersions(projectId, app.id).catch((e: unknown) =>
        console.warn(`version sync after import failed for app ${app.id}:`, (e as Error).message),
      )
      return app
    },

    /** Pulls the app's store versions and upserts them locally. Returns the local rows. */
    async syncVersions(projectId: string, appId: string) {
      const app = await db.query.apps.findFirst({
        where: and(eq(schema.apps.id, appId), eq(schema.apps.projectId, projectId)),
      })
      if (!app) throw new IntegrationError('NOT_FOUND', 'App not found')
      if (!app.integrationId || !app.externalId) {
        throw new IntegrationError('NOT_LINKED', 'This app is not linked to a store')
      }
      const integration = await requireRow(projectId, app.integrationId)
      let remote: RemoteVersion[]
      try {
        remote =
          app.platform === 'ios'
            ? await appStoreClient(integration).listVersions(app.externalId)
            : await googlePlayClient(integration).listVersions(app.externalId)
      } catch (e) {
        throw new IntegrationError('VERIFICATION_FAILED', describe(e))
      }
      const now = new Date()
      if (remote.length > 0) {
        const rows = remote.map((v) => ({
          appId: app.id,
          externalId: v.id,
          versionString: v.versionString,
          platform: v.platform,
          state: v.state,
          releaseType: v.releaseType,
          storeCreatedAt: v.createdAt,
          syncedAt: now,
          updatedAt: now,
        }))
        await db
          .insert(schema.appVersions)
          .values(rows)
          .onConflictDoUpdate({
            target: [schema.appVersions.appId, schema.appVersions.externalId],
            set: {
              versionString: sql`excluded.version_string`,
              platform: sql`excluded.platform`,
              state: sql`excluded.state`,
              releaseType: sql`excluded.release_type`,
              storeCreatedAt: sql`excluded.store_created_at`,
              syncedAt: now,
              updatedAt: now,
            },
          })
      }
      await linkVersionsToReleases(db, projectId, app.id)
      return db
        .select()
        .from(schema.appVersions)
        .where(eq(schema.appVersions.appId, app.id))
        .orderBy(desc(schema.appVersions.storeCreatedAt))
    },

    /** Store clients for an integration of the project. */
    async appStoreClientFor(projectId: string, integrationId: string) {
      return appStoreClient(await requireRow(projectId, integrationId))
    },
    async googlePlayClientFor(projectId: string, integrationId: string) {
      return googlePlayClient(await requireRow(projectId, integrationId))
    },

    async remove(projectId: string, integrationId: string) {
      const row = await requireRow(projectId, integrationId)
      await db.delete(schema.integrations).where(eq(schema.integrations.id, row.id))
    },
  }
}
