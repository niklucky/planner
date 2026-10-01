import { sql } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { projects } from './projects'

/**
 * Where a project's published content is served: production (exactly one, the store
 * builds) and any others, e.g. Development for dev builds. An API key belongs to one.
 */
export const projectEnvironments = pgTable(
  'project_environments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** The one environment others fall back to; it can't be deleted. */
    isProduction: boolean('is_production').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.projectId, t.name),
    uniqueIndex('project_environments_one_production').on(t.projectId).where(sql`${t.isProduction}`),
  ],
)

export type ProjectEnvironmentRow = typeof projectEnvironments.$inferSelect
