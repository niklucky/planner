import { PLATFORMS } from '@planner/shared'
import { pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { integrations } from './integrations'
import { projects } from './projects'

export const platformEnum = pgEnum('platform', PLATFORMS)

/** A mobile app inside a project, optionally linked to its store record. */
export const apps = pgTable(
  'apps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
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
