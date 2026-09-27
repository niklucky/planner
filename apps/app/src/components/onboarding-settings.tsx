import { Badge, Button, Callout, Field, Form, Inline, Input, Section, Select, Stack, Text } from '@planner/frontend'
import { draftLocales, localeCodeSchema, type OnboardingDetail } from '@planner/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useTRPC } from '../lib/trpc'

interface Props {
  projectId: string
  detail: OnboardingDetail
  onDeleted: () => void
}

export function OnboardingSettings({ projectId, detail, onDeleted }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { draft, profile, latestRelease } = detail
  const [name, setName] = useState(draft.name)
  const [key, setKey] = useState(draft.key)
  const [defaultLocale, setDefaultLocale] = useState(draft.defaultLocale)
  const [locales, setLocales] = useState<string[]>(draftLocales(draft))
  const [defaultActions, setDefaultActions] = useState<string[]>(draft.defaultActions)
  const [newLocale, setNewLocale] = useState('')
  const [localeError, setLocaleError] = useState<string | null>(null)

  const invalidate = () => queryClient.invalidateQueries(trpc.onboardings.pathFilter())
  const update = useMutation(trpc.onboardings.update.mutationOptions({ onSuccess: invalidate }))
  const remove = useMutation(
    trpc.onboardings.remove.mutationOptions({
      onSuccess: async () => {
        onDeleted()
        await invalidate()
      },
    }),
  )

  const addLocale = () => {
    const parsed = localeCodeSchema.safeParse(newLocale)
    if (!parsed.success) return setLocaleError(parsed.error.issues[0]!.message)
    if (locales.some((l) => l.toLowerCase() === parsed.data.toLowerCase())) return setLocaleError('Already enabled')
    setLocaleError(null)
    setLocales([...locales, parsed.data])
    setNewLocale('')
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    update.mutate({ projectId, onboardingId: draft.id, name, key, defaultLocale, locales, defaultActions })
  }

  return (
    <Stack>
      <Form onSubmit={onSubmit} error={update.error?.message}>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Key (what the app asks for)">
          <Input value={key} onChange={(e) => setKey(e.target.value)} />
        </Field>
        {latestRelease && key !== draft.key && (
          <Callout tone="warning">
            Apps ask for {draft.key}. After renaming, the published releases answer under {key.trim() || '…'} only.
          </Callout>
        )}

        <Section title="Languages">
          <Inline>
            {locales.map((l) => (
              <Inline key={l}>
                <Badge>{l}</Badge>
                {l !== defaultLocale && (
                  <Button size="sm" onClick={() => setLocales(locales.filter((x) => x !== l))}>
                    Remove
                  </Button>
                )}
              </Inline>
            ))}
          </Inline>
          <Inline>
            <Input
              value={newLocale}
              placeholder="pt, zh-Hant…"
              onChange={(e) => setNewLocale(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addLocale()
                }
              }}
            />
            <Button onClick={addLocale}>Add language</Button>
          </Inline>
          {localeError && <Text>{localeError}</Text>}
          <Field label="Default language (served when nothing closer exists; must be complete)">
            <Select value={defaultLocale} onChange={(e) => setDefaultLocale(e.target.value)}>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Text>
            Apps get the closest language: exact, then the store alias (zh-Hans → zh), then the language before the
            hyphen (pt-BR → pt), then the default. Removing a language keeps its copy; adding it back restores it.
          </Text>
        </Section>

        <Section title="Default buttons">
          <Text>Every page without its own buttons gets these. Labels per language are in Copy.</Text>
          {defaultActions.map((action, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: buttons are positional; the index is their identity
            <Inline key={`${i}-${action}`}>
              <Select
                value={action}
                onChange={(e) => setDefaultActions(defaultActions.map((a, j) => (j === i ? e.target.value : a)))}
              >
                {(profile?.actions ?? [action]).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
              <Button size="sm" onClick={() => setDefaultActions(defaultActions.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </Inline>
          ))}
          {defaultActions.length < 5 && (
            <Inline>
              <Button size="sm" onClick={() => setDefaultActions([...defaultActions, profile?.actions[0] ?? 'next'])}>
                Add button
              </Button>
            </Inline>
          )}
        </Section>

        <Inline>
          <Button type="submit" variant="primary" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          {update.isSuccess && <Text>Saved.</Text>}
        </Inline>
      </Form>

      <Section title="Delete">
        <Text>
          Deletes the draft and every release. Apps get a 404 and forget their cached copy, so the onboarding stops
          showing.
        </Text>
        <Inline>
          <Button
            onClick={() => {
              if (confirm(`Delete ${draft.name} and all its releases? Apps stop showing it.`))
                remove.mutate({ projectId, onboardingId: draft.id })
            }}
            disabled={remove.isPending}
          >
            Delete onboarding
          </Button>
        </Inline>
        {remove.error && <Callout tone="danger">{remove.error.message}</Callout>}
      </Section>
    </Stack>
  )
}
