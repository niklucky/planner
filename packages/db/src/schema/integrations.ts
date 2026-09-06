import { INTEGRATION_PROVIDERS, INTEGRATION_STATUSES } from '@planner/shared'
import { jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { projects } from './projects'

export const integrationProviderEnum = pgEnum('integration_provider', INTEGRATION_PROVIDERS)
export const integrationStatusEnum = pgEnum('integration_status', INTEGRATION_STATUSES)

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    provider: integrationProviderEnum('provider').notNull(),
    /** Encrypted JSON (AES-256-GCM via the server's ENCRYPTION_KEY). */
    credentials: text('credentials').notNull(),
    /** Non-secret identifiers safe to show in the UI. */
    metadata: jsonb('metadata').$type<Record<string, string>>().notNull().default({}),
    status: integrationStatusEnum('status').notNull().default('connected'),
    lastError: text('last_error'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.projectId, t.provider)],
)

export type IntegrationRow = typeof integrations.$inferSelect
