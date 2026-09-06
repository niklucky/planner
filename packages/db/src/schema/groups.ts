import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { projects } from './projects'

/**
 * Apps that are the same product on different platforms (iOS + Android), and
 * therefore share releases and release notes. A project can have several
 * groups, e.g. "Production" and "Dev".
 */
export const appGroups = pgTable('app_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AppGroupRow = typeof appGroups.$inferSelect
