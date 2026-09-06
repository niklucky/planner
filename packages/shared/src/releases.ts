import { z } from 'zod'

/** How release notes are authored for a release. */
export const NOTES_MODES = ['shared', 'per_platform'] as const
export type NotesMode = (typeof NOTES_MODES)[number]

/** Which platform a note applies to; `shared` applies to all. */
export const NOTE_SCOPES = ['shared', 'ios', 'android'] as const
export type NoteScope = (typeof NOTE_SCOPES)[number]

/** Apple's limit for "What's New". */
export const RELEASE_NOTE_MAX_LENGTH = 4000

export const releaseIdInput = z.object({ releaseId: z.uuid() })

export const releaseNoteInput = z.object({
  scope: z.enum(NOTE_SCOPES),
  locale: z.string().trim().min(2).max(20),
  text: z.string().max(RELEASE_NOTE_MAX_LENGTH),
})
export type ReleaseNoteInput = z.infer<typeof releaseNoteInput>

export const saveReleaseNotesInput = z.object({
  releaseId: z.uuid(),
  notesMode: z.enum(NOTES_MODES),
  notes: z.array(releaseNoteInput).max(200),
})
export type SaveReleaseNotesInput = z.infer<typeof saveReleaseNotesInput>

/** App Store version states in which metadata (incl. what's new) can be edited. */
export const EDITABLE_VERSION_STATES = [
  'PREPARE_FOR_SUBMISSION',
  'READY_FOR_REVIEW',
  'WAITING_FOR_REVIEW',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
  'INVALID_BINARY',
] as const

/** Natural version order: "3.0.1" > "3.0.0" > "2.10.0" > "2.9.9". */
export function compareVersions(a: string, b: string) {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return a.localeCompare(b)
}

export interface PushPlanInput {
  notesMode: NotesMode
  notes: Array<{ scope: NoteScope; locale: string; text: string }>
  versions: Array<{ id: string; appName: string; versionString: string; state: string; platform: 'ios' | 'android' }>
  storeLocalizations: Array<{ appVersionId: string; locale: string; whatsNew: string | null }>
}

export interface PushPlanVersion {
  appVersionId: string
  appName: string
  versionString: string
  state: string
  /** Whether the store lets us edit metadata in the version's current state. */
  editable: boolean
  /** Locales whose store text differs from our notes. */
  changes: Array<{ locale: string; from: string | null; to: string }>
  /** Locales already matching the store. */
  unchanged: string[]
  /** Locales we have notes for but the store version has no localization yet. */
  missingInStore: string[]
}

/** Resolves which note applies to a platform: platform-specific first, then shared. */
export function resolveNoteScope(notesMode: NotesMode, platform: 'ios' | 'android'): NoteScope {
  return notesMode === 'shared' ? 'shared' : platform
}

/** What pushing the release's notes would change, per App Store version. */
export function planPush(input: PushPlanInput): PushPlanVersion[] {
  return input.versions
    .filter((v) => v.platform === 'ios')
    .map((v) => {
      const scope = resolveNoteScope(input.notesMode, v.platform)
      const notes = input.notes.filter((n) => n.scope === scope && n.text.trim().length > 0)
      const store = input.storeLocalizations.filter((l) => l.appVersionId === v.id)
      const plan: PushPlanVersion = {
        appVersionId: v.id,
        appName: v.appName,
        versionString: v.versionString,
        state: v.state,
        editable: (EDITABLE_VERSION_STATES as readonly string[]).includes(v.state),
        changes: [],
        unchanged: [],
        missingInStore: [],
      }
      for (const note of notes) {
        const loc = store.find((l) => l.locale === note.locale)
        if (!loc) plan.missingInStore.push(note.locale)
        else if ((loc.whatsNew ?? '') === note.text) plan.unchanged.push(note.locale)
        else plan.changes.push({ locale: note.locale, from: loc.whatsNew, to: note.text })
      }
      return plan
    })
}
