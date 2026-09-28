import { Button, Callout, Checkbox, Dialog, Inline, List, Stack, Text } from '@planner/frontend'
import type { ReleaseDiff } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTRPC } from '../lib/trpc'

interface Props {
  projectId: string
  onboardingId: string
  onClose: () => void
}

/** Shows what changed and what blocks, then freezes the draft into a release. */
export function PublishOnboardingDialog({ projectId, onboardingId, onClose }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [offerAgain, setOfferAgain] = useState(false)
  const preview = useQuery(
    trpc.onboardings.previewPublish.queryOptions({ projectId, onboardingId, offerAgain }, { staleTime: 0 }),
  )
  const publish = useMutation(
    trpc.onboardings.publish.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.onboardings.pathFilter()),
    }),
  )
  const p = preview.data
  const done = publish.data

  const nextVersion = p?.current ? p.current.version + (offerAgain ? 1 : 0) : 1

  return (
    <Dialog open title="Publish onboarding" onClose={onClose}>
      <Stack>
        {!p && <Text>{preview.error?.message ?? 'Checking…'}</Text>}
        {p && !done && (
          <>
            {p.errors.length > 0 && (
              <Callout tone="danger" title="Fix these first">
                <List>
                  {p.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </List>
              </Callout>
            )}
            {p.warnings.length > 0 && (
              <Callout tone="warning">
                <List>
                  {p.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </List>
              </Callout>
            )}
            {p.errors.length === 0 && (
              <>
                <Text>
                  Goes live in {p.locales.length} {p.locales.length === 1 ? 'language' : 'languages'}:{' '}
                  {p.locales.join(', ')}.
                </Text>
                {p.skipped.length > 0 && (
                  <Callout tone="warning" title="Left out: missing words (these fall back to the default language)">
                    <List>
                      {p.skipped.map((s) => (
                        <li key={s.locale}>
                          {s.locale}: {s.missing.length} missing, e.g. {s.missing.slice(0, 2).join('; ')}
                        </li>
                      ))}
                    </List>
                  </Callout>
                )}
                <Changes diff={p.diff} />
              </>
            )}
            <Checkbox
              label="Offer it again to people who haven't finished it"
              checked={offerAgain}
              onChange={(e) => setOfferAgain(e.target.checked)}
              disabled={!p.current}
            />
            <Text>
              {!p.current
                ? 'First release: version 1.'
                : offerAgain
                  ? `Version goes to ${nextVersion}: people who skipped or dismissed it see it again. People who finished it never do.`
                  : `A silent fix: version stays ${nextVersion}, nobody sees it again because of this.`}
            </Text>
            {publish.error && <Callout tone="danger">{publish.error.message}</Callout>}
            <Inline>
              <Button
                variant="primary"
                size="lg"
                disabled={p.errors.length > 0 || publish.isPending || preview.isFetching}
                onClick={() => publish.mutate({ projectId, onboardingId, offerAgain })}
              >
                {publish.isPending ? 'Publishing…' : `Publish version ${nextVersion}`}
              </Button>
              <Button size="lg" onClick={onClose}>
                Cancel
              </Button>
            </Inline>
          </>
        )}
        {done && (
          <>
            <Text>
              Published version {done.version} (revision {done.revision}) in {done.locales.length} languages. Apps pick
              it up within about 5 minutes (the proxy's cache).
            </Text>
            <Inline>
              <Button variant="primary" size="lg" onClick={onClose}>
                Done
              </Button>
            </Inline>
          </>
        )}
      </Stack>
    </Dialog>
  )
}

function Changes({ diff }: { diff: ReleaseDiff }) {
  if (diff.first) return <Text>Nothing is live yet: this is the first release.</Text>
  const lines: string[] = []
  if (diff.addedPages.length) lines.push(`New pages: ${diff.addedPages.join(', ')}`)
  if (diff.removedPages.length) lines.push(`Removed pages: ${diff.removedPages.join(', ')}`)
  if (diff.reordered) lines.push('Pages are in a new order')
  for (const c of diff.changedPages) {
    lines.push(`${c.id} changed in ${c.locales.length > 5 ? `${c.locales.length} languages` : c.locales.join(', ')}`)
  }
  if (diff.defaultButtons.length)
    lines.push(
      `Default buttons changed in ${diff.defaultButtons.length > 5 ? `${diff.defaultButtons.length} languages` : diff.defaultButtons.join(', ')}`,
    )
  if (diff.addedLocales.length) lines.push(`New languages: ${diff.addedLocales.join(', ')}`)
  if (diff.removedLocales.length) lines.push(`Languages no longer live: ${diff.removedLocales.join(', ')}`)
  if (lines.length === 0) return <Text>No changes since the last release.</Text>
  return (
    <Callout title="Changes since the last release">
      <List>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </List>
    </Callout>
  )
}
