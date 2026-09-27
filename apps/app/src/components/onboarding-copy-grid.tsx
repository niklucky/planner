import { Badge, Button, Callout, Inline, Stack, Table, Text } from '@planner/frontend'
import {
  type DefaultLabels,
  defaultWordFields,
  draftLocales,
  emptyCopy,
  missingWords,
  type OnboardingDetail,
  type OnboardingDraft,
  type PageCopy,
  pageWordFields,
  readWord,
  writeWord,
} from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTRPC } from '../lib/trpc'

/** A row of the grid: one word of one page (or of the default buttons) across languages. */
interface Row {
  /** Page id, or null for the default buttons. */
  pageId: string | null
  word: string
  label: string
}

type Copies = Record<string, PageCopy> // `${pageId}|${locale}`
type Labels = Record<string, DefaultLabels> // locale

interface Grid {
  copies: Copies
  labels: Labels
  /** Cell keys (`pageId|locale`, or `labels|locale`) changed since the last save. */
  dirty: Set<string>
}

const cellKey = (pageId: string, locale: string) => `${pageId}|${locale}`

/** One word written into the grid; `machine` marks it as unreviewed machine output. */
function applyWord(g: Grid, row: Row, locale: string, value: string, machine: boolean): Grid {
  if (row.pageId === null) {
    const i = Number(row.word.slice(6))
    const cur = g.labels[locale] ?? { labels: [], machine: [] }
    const labels = [...cur.labels]
    while (labels.length <= i) labels.push('')
    labels[i] = value
    const flags = cur.machine.filter((m) => m !== row.word)
    return {
      ...g,
      labels: { ...g.labels, [locale]: { labels, machine: machine ? [...flags, row.word] : flags } },
      dirty: new Set(g.dirty).add(`labels|${locale}`),
    }
  }
  const k = cellKey(row.pageId, locale)
  return {
    ...g,
    copies: { ...g.copies, [k]: writeWord(g.copies[k], row.word, value, machine) },
    dirty: new Set(g.dirty).add(k),
  }
}
const blank = (s: string) => s.trim() === ''

/** Concurrency-limited map, so a big grid doesn't fire dozens of translation calls at once. */
async function eachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!)
  })
  await Promise.all(workers)
}

export function OnboardingCopyGrid({ projectId, detail }: { projectId: string; detail: OnboardingDetail }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { draft, profile } = detail
  const locales = draftLocales(draft)
  const { data: integrations = [] } = useQuery(trpc.integrations.list.queryOptions({ projectId }))
  const translationReady = integrations.some((i) => i.provider === 'translation' && i.status === 'connected')

  const [grid, setGrid] = useState<Grid>(() => {
    const copies: Copies = {}
    for (const page of draft.pages) for (const [l, c] of Object.entries(page.copy)) copies[cellKey(page.id, l)] = c
    return { copies, labels: draft.defaultLabels, dirty: new Set() }
  })
  const { copies, labels, dirty } = grid
  const [progress, setProgress] = useState<string | null>(null)
  const [translateErrors, setTranslateErrors] = useState<string[]>([])

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = defaultWordFields(draft.defaultActions).map((w) => ({
      pageId: null,
      word: w.id,
      label: w.label,
    }))
    for (const page of draft.pages) {
      for (const w of pageWordFields(page, profile)) out.push({ pageId: page.id, word: w.id, label: w.label })
    }
    return out
  }, [draft, profile])

  // The grid's current state as a draft, so completeness uses the same rule as publishing.
  const current: OnboardingDraft = useMemo(
    () => ({
      ...draft,
      defaultLabels: labels,
      pages: draft.pages.map((p) => ({
        ...p,
        copy: Object.fromEntries(locales.map((l) => [l, copies[cellKey(p.id, l)] ?? emptyCopy()])),
      })),
    }),
    [draft, labels, copies, locales],
  )
  const missingByLocale = useMemo(
    () => Object.fromEntries(locales.map((l) => [l, missingWords(current, profile, l)])),
    [current, profile, locales],
  )
  const complete = locales.filter((l) => missingByLocale[l]!.length === 0).length

  const read = (row: Row, locale: string) =>
    row.pageId === null
      ? (labels[locale]?.labels[Number(row.word.slice(6))] ?? '')
      : readWord(copies[cellKey(row.pageId, locale)], row.word)
  const isMachine = (row: Row, locale: string) =>
    row.pageId === null
      ? (labels[locale]?.machine.includes(row.word) ?? false)
      : (copies[cellKey(row.pageId, locale)]?.machine.includes(row.word) ?? false)

  const write = (row: Row, locale: string, value: string, machine = false) =>
    setGrid((g) => applyWord(g, row, locale, value, machine))

  const save = useMutation(trpc.onboardings.saveCopy.mutationOptions())
  const translate = useMutation(trpc.translations.translate.mutationOptions())

  const saveNow = async () => {
    const state = grid
    const pages = [...state.dirty]
      .filter((k) => !k.startsWith('labels|'))
      .map((k) => {
        const [pageId, locale] = k.split('|') as [string, string]
        return { pageId, locale, ...(state.copies[k] ?? emptyCopy()) }
      })
    const defaultLabels = [...state.dirty]
      .filter((k) => k.startsWith('labels|'))
      .map((k) => {
        const locale = k.slice(7)
        return { locale, ...(state.labels[locale] ?? { labels: [], machine: [] }) }
      })
    await save.mutateAsync({ projectId, onboardingId: draft.id, pages, defaultLabels })
    // Keep edits made while saving; only what was sent is clean now.
    setGrid((g) => ({ ...g, dirty: new Set([...g.dirty].filter((k) => !state.dirty.has(k))) }))
    await queryClient.invalidateQueries(trpc.onboardings.pathFilter())
  }

  /** Words with a source in the default language and at least one empty language. */
  const translatable = rows
    .map((row) => ({
      row,
      text: read(row, draft.defaultLocale),
      targets: locales.filter((l) => l !== draft.defaultLocale && blank(read(row, l))),
    }))
    .filter((t) => !blank(t.text) && t.targets.length > 0)
  const emptyCells = translatable.reduce((n, t) => n + t.targets.length, 0)

  const translateMissing = async () => {
    setTranslateErrors([])
    let done = 0
    const errors: string[] = []
    setProgress(`Translating 0 of ${translatable.length}…`)
    await eachLimited(translatable, 3, async ({ row, text, targets }) => {
      try {
        const result = await translate.mutateAsync({
          projectId,
          text,
          sourceLocale: draft.defaultLocale,
          targetLocales: targets,
          purpose: 'onboarding',
        })
        for (const t of result.translations) write(row, t.locale, t.text, true)
        if (result.unsupported.length > 0)
          errors.push(`${row.label}: not translated into ${result.unsupported.join(', ')}`)
      } catch (e) {
        errors.push(`${row.label}: ${(e as Error).message}`)
      }
      done++
      setProgress(`Translating ${done} of ${translatable.length}…`)
    })
    setTranslateErrors(errors)
    setProgress(null)
    // Save once the last results have rendered into the grid.
    setSaveAfterTranslate(true)
  }
  const [saveAfterTranslate, setSaveAfterTranslate] = useState(false)
  useEffect(() => {
    if (!saveAfterTranslate) return
    setSaveAfterTranslate(false)
    saveNow().catch(() => {})
  })

  const machineCount = rows.reduce((n, row) => n + locales.filter((l) => isMachine(row, l)).length, 0)
  const approveAll = () => {
    for (const row of rows) for (const l of locales) if (isMachine(row, l)) write(row, l, read(row, l), false)
  }

  const pageKey = (pageId: string) => draft.pages.find((p) => p.id === pageId)?.key ?? ''

  return (
    <Stack>
      <Inline>
        <Button variant="primary" onClick={() => saveNow()} disabled={dirty.size === 0 || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        {translationReady && (
          <Button onClick={translateMissing} disabled={emptyCells === 0 || progress !== null}>
            Translate missing ({emptyCells})
          </Button>
        )}
        {machineCount > 0 && (
          <Button onClick={approveAll} disabled={progress !== null}>
            Approve all machine ({machineCount})
          </Button>
        )}
        {dirty.size > 0 && <Badge tone="warning">Unsaved</Badge>}
        {progress && <Text>{progress}</Text>}
      </Inline>
      <Text>
        {complete} of {locales.length} languages complete. A language with any empty cell is left out of the next
        release, and the app falls back to {draft.defaultLocale}.
        {!translationReady && ' Connect a translation provider in Integrations to fill empty cells.'} Dashed cells are
        machine translations: edit or approve them.
      </Text>
      {save.error && <Callout tone="danger">{save.error.message}</Callout>}
      {translateErrors.length > 0 && <Callout tone="warning">{translateErrors.join(' · ')}</Callout>}

      {draft.pages.length === 0 ? (
        <Text>No pages yet.</Text>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Word</th>
              {locales.map((l) => (
                <th key={l} title={missingByLocale[l]!.slice(0, 20).join('\n')}>
                  <Inline>
                    {l}
                    {l === draft.defaultLocale && <Badge>default</Badge>}
                    {missingByLocale[l]!.length > 0 && (
                      <Badge tone={l === draft.defaultLocale ? 'danger' : 'warning'}>
                        {missingByLocale[l]!.length} missing
                      </Badge>
                    )}
                  </Inline>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const groupStart = i === 0 || rows[i - 1]!.pageId !== row.pageId
              return [
                groupStart && (
                  <tr key={`group-${row.pageId}`} data-group="">
                    <th>{row.pageId === null ? 'Default buttons' : pageKey(row.pageId)}</th>
                    <td colSpan={locales.length} />
                  </tr>
                ),
                <tr key={`${row.pageId}-${row.word}`}>
                  <th>{row.label}</th>
                  {locales.map((l) => {
                    const value = read(row, l)
                    const machine = isMachine(row, l)
                    const required = missingByLocale[l]!.length > 0 && blank(value) && !row.word.startsWith('field:')
                    return (
                      <td key={l} data-state={machine ? 'machine' : required ? 'missing' : undefined}>
                        <textarea
                          aria-label={`${row.label} (${l})`}
                          value={value}
                          rows={row.word === 'body' ? 3 : 1}
                          dir={['ar', 'he', 'fa', 'ur'].includes(l.split('-')[0]!) ? 'rtl' : undefined}
                          onChange={(e) => write(row, l, e.target.value)}
                        />
                        {machine && (
                          <Button size="sm" onClick={() => write(row, l, value, false)}>
                            Approve
                          </Button>
                        )}
                      </td>
                    )
                  })}
                </tr>,
              ]
            })}
          </tbody>
        </Table>
      )}
    </Stack>
  )
}
