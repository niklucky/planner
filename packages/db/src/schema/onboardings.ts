import type { AppProfile, FieldValue, OnboardingDocument } from '@planner/shared'
import { integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { files } from './files'
import { appGroups } from './groups'
import { projects } from './projects'

/** What an app group understands: the vocabulary its onboardings may use (imported profile.json). */
export const appProfiles = pgTable('app_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  appGroupId: uuid('app_group_id')
    .notNull()
    .unique()
    .references(() => appGroups.id, { onDelete: 'cascade' }),
  profile: jsonb('profile').$type<AppProfile>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** An onboarding of an app group: iOS and Android show the same story. Its rows are the draft. */
export const onboardings = pgTable(
  'onboardings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // No cascade: an app group that empties out must not take published onboardings with it.
    appGroupId: uuid('app_group_id')
      .notNull()
      .references(() => appGroups.id, { onDelete: 'no action' }),
    /** What the app asks for, e.g. capsule-intro. */
    key: text('key').notNull(),
    name: text('name').notNull(),
    defaultLocale: text('default_locale').notNull(),
    /** Enabled languages, the default included. */
    locales: text('locales').array().notNull().default([]),
    /** Buttons of every page without its own list, e.g. ["next", "skip"]. */
    defaultActions: text('default_actions').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.projectId, t.key)],
)

/** The draft's pages, in order. Structure only: the words live in onboarding_page_copy. */
export const onboardingPages = pgTable(
  'onboarding_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    onboardingId: uuid('onboarding_id')
      .notNull()
      .references(() => onboardings.id, { onDelete: 'cascade' }),
    /** The page id in the document, stable across versions. */
    key: text('key').notNull(),
    position: integer('position').notNull().default(0),
    /** The page's own buttons; null uses the onboarding's default actions. */
    actions: text('actions').array(),
    /** Empty means every platform. */
    platforms: text('platforms').array().notNull().default([]),
    /** Shared (not translated) field values, e.g. scene. */
    fields: jsonb('fields').$type<Record<string, FieldValue>>().notNull().default({}),
    colors: jsonb('colors').$type<Array<{ key: string; value: string }>>().notNull().default([]),
    media: jsonb('media').$type<Array<{ key: string; fileId: string }>>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.onboardingId, t.key)],
)

/** A page's words in one language. */
export const onboardingPageCopy = pgTable(
  'onboarding_page_copy',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => onboardingPages.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    /** One per action of the page's own list, in order. */
    actionLabels: text('action_labels').array().notNull().default([]),
    /** Translated fields only, e.g. kicker, note. */
    fields: jsonb('fields').$type<Record<string, string>>().notNull().default({}),
    /** Word ids (title, body, label:0, field:kicker) that are unreviewed machine translations. */
    machine: text('machine').array().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.pageId, t.locale)],
)

/** Labels of the default actions, per language. */
export const onboardingDefaultLabels = pgTable(
  'onboarding_default_labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    onboardingId: uuid('onboarding_id')
      .notNull()
      .references(() => onboardings.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    labels: text('labels').array().notNull().default([]),
    machine: text('machine').array().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.onboardingId, t.locale)],
)

/** Each publish, frozen. The public endpoint only ever reads these. */
export const onboardingReleases = pgTable(
  'onboarding_releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    onboardingId: uuid('onboarding_id')
      .notNull()
      .references(() => onboardings.id, { onDelete: 'cascade' }),
    /** What the app compares; goes up only when the editor chose to offer it again. */
    version: integer('version').notNull(),
    /** Goes up on every publish; feeds the ETag. */
    revision: integer('revision').notNull(),
    defaultLocale: text('default_locale').notNull(),
    /** Every published language, in contract shape. Media URLs are relative (files/<sha256>). */
    document: jsonb('document').$type<Record<string, OnboardingDocument>>().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [unique().on(t.onboardingId, t.revision)],
)

/** Files a release refers to: the only project files the public files route serves. */
export const onboardingReleaseFiles = pgTable(
  'onboarding_release_files',
  {
    releaseId: uuid('release_id')
      .notNull()
      .references(() => onboardingReleases.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.releaseId, t.fileId] })],
)

/** Read-only keys for a project's published content (the app's proxy sends one). Only the hash is kept. */
export const projectApiKeys = pgTable('project_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  /** First characters of the key, to tell keys apart in the UI. */
  prefix: text('prefix').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AppProfileRow = typeof appProfiles.$inferSelect
export type OnboardingRow = typeof onboardings.$inferSelect
export type OnboardingPageRow = typeof onboardingPages.$inferSelect
export type OnboardingPageCopyRow = typeof onboardingPageCopy.$inferSelect
export type OnboardingReleaseRow = typeof onboardingReleases.$inferSelect
export type ProjectApiKeyRow = typeof projectApiKeys.$inferSelect
