import { Button, Field, Form, Inline, Row, Select, Stack, Text, Textarea } from '@planner/frontend'
import {
  type NoteScope,
  type NotesMode,
  RELEASE_NOTE_MAX_LENGTH,
  formatStorePlatform,
  formatStoreState,
} from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useTRPC } from '../lib/trpc'

type NotesByKey = Record<string, string>
const keyOf = (scope: NoteScope, locale: string) => `${scope}:${locale}`

export function ReleaseNotesEditor({ projectId, releaseId }: { projectId: string; releaseId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const query = useQuery(trpc.releases.get.queryOptions({ projectId, releaseId }))
  const release = query.data

  const [notesMode, setNotesMode] = useState<NotesMode>('shared')
  const [notes, setNotes] = useState<NotesByKey>({})
  const [dirty, setDirty] = useState(false)

  // Reset local state whenever fresh data arrives and there are no unsaved edits.
  useEffect(() => {
    if (!release || dirty) return
    setNotesMode(release.notesMode)
    setNotes(Object.fromEntries(release.notes.map((n) => [keyOf(n.scope, n.locale), n.text])))
  }, [release, dirty])

  const invalidate = () => queryClient.invalidateQueries(trpc.releases.pathFilter())
  const save = useMutation(
    trpc.releases.saveNotes.mutationOptions({
      onSuccess: async () => {
        setDirty(false)
        await invalidate()
      },
    }),
  )
  const pull = useMutation(
    trpc.releases.pullNotes.mutationOptions({
      onSuccess: async () => {
        setDirty(false)
        await invalidate()
      },
    }),
  )

  const platforms = useMemo(
    () => Array.from(new Set(release?.versions.map((v) => v.platform) ?? [])),
    [release],
  )
  const locales = useMemo(() => {
    const set = new Set<string>()
    for (const n of release?.notes ?? []) set.add(n.locale)
    for (const l of release?.storeLocalizations ?? []) set.add(l.locale)
    for (const k of Object.keys(notes)) set.add(k.split(':')[1]!)
    return Array.from(set).sort()
  }, [release, notes])

  if (!release) return <Text>{query.error?.message ?? 'Loading…'}</Text>

  const scopes: NoteScope[] = notesMode === 'shared' ? ['shared'] : platforms
  const lastPull = release.storeLocalizations.reduce<Date | null>(
    (max, l) => (!max || l.syncedAt > max ? l.syncedAt : max),
    null,
  )

  const update = (scope: NoteScope, locale: string, text: string) => {
    setDirty(true)
    setNotes((prev) => ({ ...prev, [keyOf(scope, locale)]: text }))
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    save.mutate({
      projectId,
      releaseId,
      notesMode,
      notes: scopes.flatMap((scope) => locales.map((locale) => ({ scope, locale, text: notes[keyOf(scope, locale)] ?? '' }))),
    })
  }

  return (
    <Stack>
      <Stack>
        {release.versions.map((v) => (
          <Row key={v.id} secondary={formatStoreState(v.state)}>
            {v.appName} · {formatStorePlatform(v.storePlatform)}
          </Row>
        ))}
      </Stack>

      <Form onSubmit={onSubmit} error={save.error?.message ?? pull.error?.message}>
        <Inline>
          <Select
            value={notesMode}
            onChange={(e) => {
              setDirty(true)
              setNotesMode(e.target.value as NotesMode)
            }}
          >
            <option value="shared">Shared notes</option>
            <option value="per_platform">Separate per platform</option>
          </Select>
          <Button type="button" onClick={() => pull.mutate({ projectId, releaseId })} disabled={pull.isPending}>
            {pull.isPending ? 'Pulling…' : 'Pull from App Store'}
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending || !dirty}>
            Save
          </Button>
        </Inline>
        {lastPull && <Text>Store text pulled {lastPull.toLocaleString()}</Text>}

        {locales.length === 0 && <Text>No locales yet. Pull from the store to start from what's live.</Text>}

        {scopes.map((scope) => (
          <Stack key={scope}>
            {scope !== 'shared' && <Text>{scope === 'ios' ? 'iOS' : 'Android'}</Text>}
            {locales.map((locale) => (
              <Field key={locale} label={locale}>
                <Textarea
                  value={notes[keyOf(scope, locale)] ?? ''}
                  maxLength={RELEASE_NOTE_MAX_LENGTH}
                  onChange={(e) => update(scope, locale, e.target.value)}
                />
              </Field>
            ))}
          </Stack>
        ))}
      </Form>
    </Stack>
  )
}
