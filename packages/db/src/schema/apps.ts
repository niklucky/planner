import { PLATFORMS } from '@planner/shared'
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const platformEnum = pgEnum('platform', PLATFORMS)

export const apps = pgTable('apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  platform: platformEnum('platform').notNull(),
  bundleId: text('bundle_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type App = typeof apps.$inferSelect
