import { NOTE_SCOPES, NOTES_MODES } from '@planner/shared'
import { pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { appGroups } from './groups'
import { projects } from './projects'

export const notesModeEnum = pgEnum('notes_mode', NOTES_MODES)
export const noteScopeEnum = pgEnum('note_scope', NOTE_SCOPES)

/**
 * A release of an app group, e.g. "3.0.1", grouping the store versions of the
 * group's apps that carry that version string. Owns the release notes.
 */
export const releases = pgTable(
  'releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => appGroups.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    notesMode: notesModeEnum('notes_mode').notNull().default('shared'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.groupId, t.version)],
)

/** Our copy of the release notes: the source of truth that gets pushed to stores. */
export const releaseNotes = pgTable(
  'release_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    scope: noteScopeEnum('scope').notNull().default('shared'),
    locale: text('locale').notNull(),
    text: text('text').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.releaseId, t.scope, t.locale)],
)

export type ReleaseRow = typeof releases.$inferSelect
export type ReleaseNoteRow = typeof releaseNotes.$inferSelect
