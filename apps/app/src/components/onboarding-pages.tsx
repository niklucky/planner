import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Columns,
  Field,
  Form,
  Inline,
  Input,
  moveItem,
  NavButton,
  PhonePreview,
  Section,
  Select,
  Split,
  Stack,
  Text,
  Textarea,
  Thumbnail,
  useDragReorder,
} from '@planner/frontend'
import {
  type AppProfile,
  contrastRatio,
  type DraftPage,
  emptyCopy,
  type FieldValue,
  isHexColor,
  type MediaFile,
  type OnboardingDetail,
  type PageCopy,
  pageWordFields,
  readWord,
  writeWord,
} from '@planner/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useRef, useState } from 'react'
import { useTRPC } from '../lib/trpc'
import { uploadOnboardingMedia } from '../lib/upload'

interface Props {
  projectId: string
  detail: OnboardingDetail
  selectedPageId: string | undefined
  onSelect: (pageId: string) => void
}

export function OnboardingPages({ projectId, detail, selectedPageId, onSelect }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { draft } = detail
  const pages = draft.pages
  const selected = pages.find((p) => p.id === selectedPageId) ?? pages[0]
  const getInput = { projectId, onboardingId: draft.id }
  const invalidate = () => queryClient.invalidateQueries(trpc.onboardings.pathFilter())

  const reorder = useMutation(
    trpc.onboardings.reorderPages.mutationOptions({
      // Optimistic: show the new order at once, then reconcile.
      onMutate: async (vars) => {
        const key = trpc.onboardings.get.queryKey(getInput)
        await queryClient.cancelQueries({ queryKey: key })
        const previous = queryClient.getQueryData(key)
        queryClient.setQueryData(key, (old) =>
          old
            ? {
                ...old,
                draft: {
                  ...old.draft,
                  pages: vars.ids.map((id) => old.draft.pages.find((p) => p.id === id)!).filter(Boolean),
                },
              }
            : old,
        )
        return { previous }
      },
      onError: (_e, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(trpc.onboardings.get.queryKey(getInput), ctx.previous)
      },
      onSettled: invalidate,
    }),
  )
  const add = useMutation(
    trpc.onboardings.savePage.mutationOptions({
      onSuccess: async (row) => {
        await invalidate()
        onSelect(row.id)
      },
    }),
  )
  const drag = useDragReorder((from, to) =>
    reorder.mutate({ ...getInput, ids: moveItem(pages, from, to).map((p) => p.id) }),
  )

  const addPage = () => {
    const keys = new Set(pages.map((p) => p.key))
    let n = pages.length + 1
    while (keys.has(`page-${n}`)) n++
    add.mutate({ ...getInput, key: `page-${n}`, actions: null, platforms: [], fields: {}, colors: [], media: [] })
  }

  return (
    <Columns
      wide
      aside={
        <>
          {pages.map((p, index) => (
            <NavButton
              key={p.id}
              onClick={() => onSelect(p.id)}
              data-status={p.id === selected?.id ? 'active' : undefined}
              trailing={index + 1}
              {...drag.itemProps(index)}
            >
              {p.key}
            </NavButton>
          ))}
          <Button onClick={addPage} disabled={add.isPending}>
            Add page
          </Button>
          {pages.length > 1 && <Text>Drag to reorder.</Text>}
          {(reorder.error || add.error) && <Text>{reorder.error?.message ?? add.error?.message}</Text>}
        </>
      }
    >
      {selected ? (
        <PageForm key={selected.id} projectId={projectId} detail={detail} page={selected} />
      ) : (
        <Text>No pages yet. Add one, or import the app's bundled JSON from the Onboardings page.</Text>
      )}
    </Columns>
  )
}

type Colors = Record<string, string>
type Media = Record<string, string>

function PageForm({ projectId, detail, page }: { projectId: string; detail: OnboardingDetail; page: DraftPage }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { draft, profile } = detail
  const locale = draft.defaultLocale

  const [key, setKey] = useState(page.key)
  const [actions, setActions] = useState<string[] | null>(page.actions)
  const [platforms, setPlatforms] = useState<string[]>(page.platforms)
  const [fields, setFields] = useState<Record<string, FieldValue>>(page.fields)
  const [colors, setColors] = useState<Colors>(Object.fromEntries(page.colors.map((c) => [c.key, c.value])))
  const [media, setMedia] = useState<Media>(Object.fromEntries(page.media.map((m) => [m.key, m.fileId])))
  const [files, setFiles] = useState<Record<string, MediaFile>>(detail.files)
  const [copy, setCopy] = useState<PageCopy>(page.copy[locale] ?? emptyCopy())
  const [dirty, setDirty] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const touch = () => setDirty(true)

  const savePage = useMutation(trpc.onboardings.savePage.mutationOptions())
  const saveCopy = useMutation(trpc.onboardings.saveCopy.mutationOptions())
  const removePage = useMutation(
    trpc.onboardings.removePage.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.onboardings.pathFilter()),
    }),
  )
  const saving = savePage.isPending || saveCopy.isPending

  const setActionsKeepingLabels = (next: string[] | null) => {
    // Labels follow buttons by position: trim or pad the default language's labels to match.
    setActions(next)
    setCopy((c) => ({ ...c, actionLabels: (next ?? []).map((_, i) => c.actionLabels[i] ?? '') }))
    touch()
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const row = await savePage.mutateAsync({
      projectId,
      onboardingId: draft.id,
      pageId: page.id,
      key: key.trim(),
      actions,
      platforms,
      fields,
      colors: Object.entries(colors).map(([k, value]) => ({ key: k, value })),
      media: Object.entries(media).map(([k, fileId]) => ({ key: k, fileId })),
    })
    await saveCopy.mutateAsync({
      projectId,
      onboardingId: draft.id,
      pages: [{ pageId: row.id, locale, ...copy }],
      defaultLabels: [],
    })
    setDirty(false)
    await queryClient.invalidateQueries(trpc.onboardings.pathFilter())
  }

  const upload = async (slot: string, file: File) => {
    setUploadError(null)
    try {
      const stored = await uploadOnboardingMedia(projectId, draft.id, file)
      setFiles((f) => ({ ...f, [stored.id]: stored }))
      setMedia((m) => ({ ...m, [slot]: stored.id }))
      touch()
    } catch (err) {
      setUploadError((err as Error).message)
    }
  }

  const words = pageWordFields({ actions }, profile)
  const effectiveActions = actions ?? draft.defaultActions
  const labelFor = (i: number) =>
    actions ? copy.actionLabels[i] : (draft.defaultLabels[locale]?.labels[i] ?? draft.defaultActions[i])
  const buttons = effectiveActions.map((action, i) => ({ action, label: labelFor(i) || action }))
  const nonSkip = buttons.filter((b) => b.action !== 'skip')

  return (
    <Split
      side={
        <Preview
          profile={profile}
          copy={copy}
          fields={fields}
          colors={colors}
          file={media.illustration ? files[media.illustration] : undefined}
          projectId={projectId}
          primary={nonSkip[0]?.label}
          secondary={nonSkip[1]?.label}
          skip={buttons.find((b) => b.action === 'skip')?.label}
        />
      }
    >
      <Form onSubmit={onSubmit} error={savePage.error?.message ?? saveCopy.error?.message}>
        <Inline>
          <Button type="submit" variant="primary" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save page'}
          </Button>
          <Button
            onClick={() => {
              if (confirm(`Delete page ${page.key} and its copy in every language?`))
                removePage.mutate({ projectId, pageId: page.id })
            }}
            disabled={removePage.isPending}
          >
            Delete page
          </Button>
          {dirty && <Badge tone="warning">Unsaved</Badge>}
        </Inline>

        <Field label="Page id (stable across versions; analytics and tests key on it)">
          <Input
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              touch()
            }}
          />
        </Field>

        <Section title={`Words in ${locale}`}>
          <Text>Other languages are in the Copy tab.</Text>
          {words.map((w) => (
            <Field key={w.id} label={w.label}>
              {w.id === 'body' ? (
                <Textarea
                  value={readWord(copy, w.id)}
                  onChange={(e) => {
                    setCopy((c) => writeWord(c, w.id, e.target.value))
                    touch()
                  }}
                />
              ) : (
                <Input
                  value={readWord(copy, w.id)}
                  onChange={(e) => {
                    setCopy((c) => writeWord(c, w.id, e.target.value))
                    touch()
                  }}
                />
              )}
            </Field>
          ))}
        </Section>

        <Section title="Buttons">
          <Select
            value={actions ? 'own' : 'default'}
            onChange={(e) => setActionsKeepingLabels(e.target.value === 'own' ? [...draft.defaultActions] : null)}
          >
            <option value="default">Default buttons ({draft.defaultActions.join(', ') || 'none'})</option>
            <option value="own">This page's own buttons</option>
          </Select>
          {actions?.map((action, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: buttons are positional; the index is their identity
            <Inline key={`${i}-${action}`}>
              <Select
                value={action}
                onChange={(e) => setActionsKeepingLabels(actions.map((a, j) => (j === i ? e.target.value : a)))}
              >
                {(profile?.actions ?? [action]).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
              <Button size="sm" onClick={() => setActionsKeepingLabels(actions.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </Inline>
          ))}
          {actions && actions.length < 5 && (
            <Inline>
              <Button size="sm" onClick={() => setActionsKeepingLabels([...actions, profile?.actions[0] ?? 'next'])}>
                Add button
              </Button>
            </Inline>
          )}
          <Text>
            The first button that isn't skip is the main one, a second sits under it, and skip is the way out.
          </Text>
        </Section>

        {profile && (
          <>
            <Section title="Platforms">
              <Inline>
                {profile.platforms.map((p) => (
                  <Checkbox
                    key={p}
                    label={p}
                    checked={platforms.includes(p)}
                    onChange={(e) => {
                      setPlatforms((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))
                      touch()
                    }}
                  />
                ))}
              </Inline>
              <Text>None ticked: the page shows everywhere.</Text>
            </Section>

            <SharedFields
              profile={profile}
              fields={fields}
              onChange={(next) => {
                setFields(next)
                touch()
              }}
            />

            <ColorFields
              profile={profile}
              colors={colors}
              onChange={(next) => {
                setColors(next)
                touch()
              }}
            />

            <Section title="Media">
              {profile.media.length === 0 && <Text>This app has no media slots.</Text>}
              {profile.media.map((slot) => {
                const file = media[slot.key] ? files[media[slot.key]!] : undefined
                return (
                  <Stack key={slot.key}>
                    <Inline>
                      <strong>{slot.key}</strong>
                      <UploadButton accept={slot.accept.join(',')} onFile={(f) => upload(slot.key, f)} />
                      {media[slot.key] && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setMedia(({ [slot.key]: _gone, ...rest }) => rest)
                            touch()
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </Inline>
                    {slot.description && <Text>{slot.description}</Text>}
                    {file && (
                      <Inline>
                        {file.contentType.startsWith('image/') && (
                          <Thumbnail src={`${file.url}?project=${projectId}`} alt={slot.key} />
                        )}
                        <Badge>
                          {file.contentType} · {file.width}×{file.height}
                        </Badge>
                      </Inline>
                    )}
                  </Stack>
                )
              })}
              {uploadError && <Callout tone="danger">{uploadError}</Callout>}
            </Section>
          </>
        )}
      </Form>
    </Split>
  )
}

function SharedFields({
  profile,
  fields,
  onChange,
}: {
  profile: AppProfile
  fields: Record<string, FieldValue>
  onChange: (fields: Record<string, FieldValue>) => void
}) {
  const shared = profile.fields.filter((f) => !f.localized)
  if (shared.length === 0) return null
  const set = (key: string, value: FieldValue | undefined) => {
    const { [key]: _old, ...rest } = fields
    onChange(value === undefined || value === '' ? rest : { ...rest, [key]: value })
  }
  return (
    <Section title="Fields">
      {shared.map((f) => {
        const value = fields[f.key]
        const label = f.description ? `${f.key} · ${f.description}` : f.key
        if (f.type === 'boolean')
          return (
            <Checkbox
              key={f.key}
              label={label}
              checked={value === true}
              onChange={(e) => set(f.key, e.target.checked || undefined)}
            />
          )
        return (
          <Field key={f.key} label={label}>
            {f.type === 'enum' ? (
              <Select value={typeof value === 'string' ? value : ''} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">None</option>
                {f.options!.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                type={f.type === 'number' ? 'number' : 'text'}
                value={value === undefined ? '' : String(value)}
                onChange={(e) =>
                  set(f.key, f.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)
                }
              />
            )}
          </Field>
        )
      })}
    </Section>
  )
}

function ColorFields({
  profile,
  colors,
  onChange,
}: {
  profile: AppProfile
  colors: Colors
  onChange: (colors: Colors) => void
}) {
  if (profile.colors.length === 0) return null
  const set = (key: string, value: string) => {
    const { [key]: _old, ...rest } = colors
    onChange(value === '' ? rest : { ...rest, [key]: value })
  }
  // Ink on the wash: warn below WCAG AA for body text.
  const ink = colors.ink
  const lowContrast = Object.entries(colors)
    .filter(([k]) => k.startsWith('background'))
    .map(([k, v]) => ({ key: k, ratio: ink ? contrastRatio(ink, v) : null }))
    .filter((c) => c.ratio !== null && c.ratio < 4.5)
  return (
    <Section title="Colours">
      {profile.colors.map((c) => {
        const value = colors[c.key] ?? ''
        const valid = value === '' || isHexColor(value)
        return (
          <Field
            key={c.key}
            label={c.description ? `${c.key} · ${c.description}` : c.key}
            error={valid ? undefined : 'Use hex, like #2B93F0'}
          >
            <Inline>
              <input
                type="color"
                aria-label={`${c.key} picker`}
                value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
                onChange={(e) => set(c.key, e.target.value.toUpperCase())}
              />
              <Input value={value} placeholder="#RRGGBB" onChange={(e) => set(c.key, e.target.value.trim())} />
            </Inline>
          </Field>
        )
      })}
      {lowContrast.map((c) => (
        <Callout key={c.key} tone="warning">
          ink on {c.key} is {c.ratio!.toFixed(1)}:1, below 4.5:1: text may be hard to read.
        </Callout>
      ))}
    </Section>
  )
}

function Preview({
  profile,
  copy,
  fields,
  colors,
  file,
  projectId,
  primary,
  secondary,
  skip,
}: {
  profile: AppProfile | null
  copy: PageCopy
  fields: Record<string, FieldValue>
  colors: Colors
  file: MediaFile | undefined
  projectId: string
  primary?: string
  secondary?: string
  skip?: string
}) {
  const hasWash = colors['background-from'] && colors['background-to']
  const scene = typeof fields.scene === 'string' ? fields.scene : undefined
  let media: React.ReactNode
  if (file?.contentType.startsWith('image/')) media = <img src={`${file.url}?project=${projectId}`} alt="" />
  else if (file?.contentType.startsWith('video/'))
    media = <video src={`${file.url}?project=${projectId}`} muted autoPlay loop playsInline />
  else if (scene) media = <Badge>scene: {scene}</Badge>
  return (
    <Stack>
      <PhonePreview
        background={hasWash ? [colors['background-from']!, colors['background-to']!] : undefined}
        ink={colors.ink}
        accent={colors.accent}
        kicker={copy.fields.kicker}
        title={copy.title}
        body={copy.body}
        note={copy.fields.note}
        media={media}
        primary={primary}
        secondary={secondary}
        skip={skip}
      />
      <Text>Preview{profile ? ` for ${profile.app}` : ''}; the app renders the real page.</Text>
    </Stack>
  )
}

function UploadButton({ accept, onFile }: { accept: string; onFile: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
      <Button size="sm" onClick={() => ref.current?.click()}>
        Upload
      </Button>
    </>
  )
}
