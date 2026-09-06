import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { platformEnum } from './apps'
import { projects } from './projects'
import { releases } from './releases'

/** A stored binary (image for now). Content-addressed by sha256 within a project. */
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  width: integer('width'),
  height: integer('height'),
  sha256: text('sha256').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** One screenshot in a release, for one platform, locale and device class. */
export const screenshots = pgTable('screenshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseId: uuid('release_id')
    .notNull()
    .references(() => releases.id, { onDelete: 'cascade' }),
  platform: platformEnum('platform').notNull(),
  locale: text('locale').notNull(),
  /** Store device class id, e.g. APP_IPHONE_67 or phoneScreenshots. */
  deviceType: text('device_type').notNull(),
  position: integer('position').notNull().default(0),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'restrict' }),
  /** The store's id for this screenshot, when it exists there. */
  storeExternalId: text('store_external_id'),
  /** The store's id of the set/listing the screenshot belongs to. */
  storeSetId: text('store_set_id'),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type FileRow = typeof files.$inferSelect
export type ScreenshotRow = typeof screenshots.$inferSelect
