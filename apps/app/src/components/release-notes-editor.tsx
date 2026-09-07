import { Button, Field, Form, Inline, Row, Section, Select, Stack, Text, Textarea } from '@planner/frontend'
import {
  type NoteScope,
  type NotesMode,
  type Platform,
  RELEASE_NOTE_MAX_LENGTH,
  formatStorePlatform,
  formatStoreState,
  matchLocale,
  planPush,
} from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useTRPC } from '../lib/trpc'
import { PushNotesDialog } from './push-notes-dialog'
import { ReleaseScreenshots } from './release-screenshots'

type NotesByKey = Record<string, string>
const keyOf = (scope: NoteScope, locale: string) => `${scope}:${locale}`

interface SourceOption {
  key: string
  releaseId: string
  scope: NoteScope
  label: string
}

export function ReleaseNotesEditor({ projectId, releaseId }: { projectId: string; releaseId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const query = useQuery(trpc.releases.get.queryOptions({ projectId, releaseId }))
  const release = query.data
  const { data: allReleases = [] } = useQuery(trpc.releases.list.queryOptions({ projectId }))
  const { data: integrations = [] } = useQuery(trpc.integrations.list.queryOptions({ projectId }))
  const translationReady = integrations.some((i) => i.provider === 'translation' && i.status === 'connected')

  // Other releases (and their note scopes) that notes can be copied from.
  const sources = useMemo<SourceOption[]>(
    () =>
      allReleases
        .filter((r) => r.id !== releaseId)
        .flatMap((r): SourceOption[] => {
          const platforms = Array.from(new Set(r.versions.map((v) => v.platform)))
          const name = (p: Platform) => (p === 'ios' ? 'iOS' : 'Android')
          const label = `${r.groupName} · ${r.version}`
          if (r.notesMode === 'shared') {
            const suffix = platforms.length > 0 ? ` · ${platforms.map(name).join(' + ')}` : ''
            return [{ key: `${r.id}:shared`, releaseId: r.id, scope: 'shared' as const, label: `${label}${suffix}` }]
          }
          return platforms.map((p) => ({ key: `${r.id}:${p}`, releaseId: r.id, scope: p, label: `${label} · ${name(p)}` }))
        }),
    [allReleases, releaseId],
  )
  // Default to the same version in another group when there is exactly one.
  const [sourceKey, setSourceKey] = useState<string | null>(null)
  const defaultSource = useMemo(() => {
    const sameVersion = sources.filter((s) => allReleases.find((r) => r.id === s.releaseId)?.version === release?.version)
    return sameVersion.length === 1 ? sameVersion[0]!.key : ''
  }, [sources, allReleases, release])
  const activeSourceKey = sourceKey ?? defaultSource
  const source = sources.find((s) => s.key === activeSourceKey)
  const sourceQuery = useQuery(
    trpc.releases.get.queryOptions({ projectId, releaseId: source?.releaseId ?? '' }, { enabled: !!source }),
  )
  const sourceNotes = useMemo(
    () => (sourceQuery.data?.notes ?? []).filter((n) => n.scope === source?.scope && n.text.trim()),
    [sourceQuery.data, source],
  )
  const sourceLocales = useMemo(() => sourceNotes.map((n) => n.locale), [sourceNotes])
  /** Source text for a target locale, via store-locale matching. */
  const sourceTextFor = (locale: string) => {
    const match = matchLocale(locale, sourceLocales)
    return match ? sourceNotes.find((n) => n.locale === match)?.text : undefined
  }

  const [notesMode, setNotesMode] = useState<NotesMode>('shared')
  const [notes, setNotes] = useState<NotesByKey>({})
  const [dirty, setDirty] = useState(false)
  const [pushing, setPushing] = useState(false)

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

  // Hooks for machine translation live here so they run on every render, before the early return.
  const [translateFrom, setTranslateFrom] = useState<string>('')
  const translate = useMutation(trpc.translations.translate.mutationOptions())
  const [translateNote, setTranslateNote] = useState<string | null>(null)

  if (!release) return <Text>{query.error?.message ?? 'Loading…'}</Text>

  const scopes: NoteScope[] = notesMode === 'shared' ? ['shared'] : platforms
  const plan = planPush(release)
  const canPush = plan.some((p) => p.editable)
  const lastPull = release.storeLocalizations.reduce<Date | null>(
    (max, l) => (!max || l.syncedAt > max ? l.syncedAt : max),
    null,
  )

  const update = (scope: NoteScope, locale: string, text: string) => {
    setDirty(true)
    setNotes((prev) => ({ ...prev, [keyOf(scope, locale)]: text }))
  }

  /** Fills every empty textarea that has a source counterpart. */
  const copyMissing = () => {
    const next = { ...notes }
    let changed = 0
    for (const scope of scopes) {
      for (const locale of locales) {
        const key = keyOf(scope, locale)
        if (next[key]?.trim()) continue
        const text = sourceTextFor(locale)
        if (text) {
          next[key] = text
          changed++
        }
      }
    }
    if (changed > 0) {
      setDirty(true)
      setNotes(next)
    }
  }
  const missingCount = scopes.reduce(
    (n, scope) => n + locales.filter((l) => !notes[keyOf(scope, l)]?.trim() && sourceTextFor(l)).length,
    0,
  )

  // Machine translation from one filled locale into the empty ones.
  const filledLocales = (scope: NoteScope) => locales.filter((l) => notes[keyOf(scope, l)]?.trim())
  const translateSource = (scope: NoteScope) => {
    const filled = filledLocales(scope)
    if (translateFrom && filled.includes(translateFrom)) return translateFrom
    return filled.find((l) => l.toLowerCase().startsWith('en')) ?? filled[0]
  }
  const runTranslate = async (scope: NoteScope, targets: string[]) => {
    const from = translateSource(scope)
    if (!from || targets.length === 0) return
    setTranslateNote(null)
    const result = await translate.mutateAsync({
      projectId,
      text: notes[keyOf(scope, from)] ?? '',
      sourceLocale: from,
      targetLocales: targets,
    })
    setNotes((prev) => {
      const next = { ...prev }
      for (const t of result.translations) next[keyOf(scope, t.locale)] = t.text
      return next
    })
    if (result.translations.length > 0) setDirty(true)
    if (result.unsupported.length > 0) setTranslateNote(`Not translated: ${result.unsupported.join(', ')}`)
  }
  const translateMissingTargets = (scope: NoteScope) => {
    const from = translateSource(scope)
    return from ? locales.filter((l) => l !== from && !notes[keyOf(scope, l)]?.trim()) : []
  }
  const translateMissingCount = scopes.reduce((n, scope) => n + translateMissingTargets(scope).length, 0)

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
            {v.appName} · {v.platform === 'android' ? `Android · ${formatStorePlatform(v.storePlatform)}` : formatStorePlatform(v.storePlatform)}
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
          <Button
            type="button"
            onClick={() => setPushing(true)}
            disabled={!canPush || dirty}
            title={dirty ? 'Save your changes first' : !canPush ? 'No version is editable in the store' : undefined}
          >
            Push to App Store…
          </Button>
        </Inline>
        {pushing && (
          <PushNotesDialog projectId={projectId} releaseId={releaseId} plan={plan} onClose={() => setPushing(false)} />
        )}
        {lastPull && <Text>Store text pulled {lastPull.toLocaleString()}</Text>}

        {translationReady && scopes.length > 0 && (
          <Inline>
            <Select value={translateSource(scopes[0]!) ?? ''} onChange={(e) => setTranslateFrom(e.target.value)}>
              {filledLocales(scopes[0]!).length === 0 && <option value="">Translate from…</option>}
              {filledLocales(scopes[0]!).map((l) => (
                <option key={l} value={l}>
                  Translate from {l}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              onClick={() => Promise.all(scopes.map((scope) => runTranslate(scope, translateMissingTargets(scope))))}
              disabled={translateMissingCount === 0 || translate.isPending}
            >
              {translate.isPending ? 'Translating…' : `Translate missing (${translateMissingCount})`}
            </Button>
          </Inline>
        )}
        {translate.error && <Text>{translate.error.message}</Text>}
        {translateNote && <Text>{translateNote}</Text>}

        {sources.length > 0 && (
          <Inline>
            <Select value={activeSourceKey} onChange={(e) => setSourceKey(e.target.value)}>
              <option value="">Copy from…</option>
              {sources.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
            {source && (
              <Button type="button" onClick={copyMissing} disabled={missingCount === 0 || sourceQuery.isPending}>
                {sourceQuery.isPending ? 'Loading…' : `Copy missing (${missingCount})`}
              </Button>
            )}
          </Inline>
        )}

        {locales.length === 0 && <Text>No locales yet. Pull from the store to start from what's live.</Text>}

        {scopes.map((scope) => (
          <Stack key={scope}>
            {scope !== 'shared' && <Text>{scope === 'ios' ? 'iOS' : 'Android'}</Text>}
            {locales.map((locale) => {
              const fromSource = source ? sourceTextFor(locale) : undefined
              const current = notes[keyOf(scope, locale)] ?? ''
              return (
                <Field
                  key={locale}
                  label={locale}
                  action={
                    <Inline>
                      {fromSource !== undefined && fromSource !== current && (
                        <Button type="button" size="sm" onClick={() => update(scope, locale, fromSource)}>
                          Copy
                        </Button>
                      )}
                      {translationReady && !current.trim() && translateSource(scope) && translateSource(scope) !== locale && (
                        <Button type="button" size="sm" onClick={() => runTranslate(scope, [locale])} disabled={translate.isPending}>
                          Translate
                        </Button>
                      )}
                    </Inline>
                  }
                >
                  <Textarea
                    value={current}
                    maxLength={RELEASE_NOTE_MAX_LENGTH}
                    onChange={(e) => update(scope, locale, e.target.value)}
                  />
                </Field>
              )
            })}
          </Stack>
        ))}
      </Form>

      <Section title="Screenshots">
        <ReleaseScreenshots projectId={projectId} releaseId={releaseId} platforms={platforms} locales={locales} />
      </Section>
    </Stack>
  )
}
