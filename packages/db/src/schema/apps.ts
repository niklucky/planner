import { PLATFORMS } from '@planner/shared'
import { pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { appGroups } from './groups'
import { integrations } from './integrations'
import { projects } from './projects'
import { releases } from './releases'

export const platformEnum = pgEnum('platform', PLATFORMS)

/** A mobile app inside a project, optionally linked to its store record. */
export const apps = pgTable(
  'apps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => appGroups.id, { onDelete: 'restrict' }),
    integrationId: uuid('integration_id').references(() => integrations.id, { onDelete: 'set null' }),
    /** The store's own id (Apple app id / Google package name). */
    externalId: text('external_id'),
    name: text('name').notNull(),
    platform: platformEnum('platform').notNull(),
    bundleId: text('bundle_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.integrationId, t.externalId)],
)

export type App = typeof apps.$inferSelect

/** Store versions of an app, synced from the store. */
export const appVersions = pgTable(
  'app_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    /** The store's id for the version. */
    externalId: text('external_id').notNull(),
    /** Project release this version belongs to (matched by version string). */
    releaseId: uuid('release_id').references(() => releases.id, { onDelete: 'set null' }),
    versionString: text('version_string').notNull(),
    platform: text('platform').notNull(),
    state: text('state').notNull(),
    releaseType: text('release_type'),
    storeCreatedAt: timestamp('store_created_at', { withTimezone: true }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.appId, t.externalId)],
)

export type AppVersion = typeof appVersions.$inferSelect

/** Snapshot of a store version's per-locale metadata, as last pulled. */
export const appVersionLocalizations = pgTable(
  'app_version_localizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appVersionId: uuid('app_version_id')
      .notNull()
      .references(() => appVersions.id, { onDelete: 'cascade' }),
    /** The store's id for the localization (needed to push updates). */
    externalId: text('external_id').notNull(),
    locale: text('locale').notNull(),
    whatsNew: text('whats_new'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.appVersionId, t.locale)],
)

export type AppVersionLocalization = typeof appVersionLocalizations.$inferSelect
