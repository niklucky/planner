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
