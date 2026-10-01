import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  Field,
  Inline,
  List,
  Select,
  Stack,
  Text,
  useStoredState,
} from '@planner/frontend'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTRPC } from '../lib/trpc'
import { useEnvironments } from './environments'
import { ReleaseChanges } from './release-changes'

interface Props {
  projectId: string
  onboardingId: string
  onClose: () => void
}

/**
 * Shows what changed and what blocks, then freezes the draft into a release served in
 * the chosen environment. Defaults to the last one chosen, else the first besides Production.
 */
export function PublishOnboardingDialog({ projectId, onboardingId, onClose }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const environments = useEnvironments(projectId)
  const [stored, setStored] = useStoredState<string | null>(`publish-environment:${projectId}`, null)
  const environment =
    environments.find((e) => e.id === stored) ?? environments.find((e) => !e.isProduction) ?? environments[0]
  const environmentId = environment?.id ?? ''
  const [offerAgain, setOfferAgain] = useState(false)
  const preview = useQuery(
    trpc.onboardings.previewPublish.queryOptions(
      { projectId, onboardingId, offerAgain, environmentId },
      { staleTime: 0, enabled: !!environment },
    ),
  )
  const publish = useMutation(
    trpc.onboardings.publish.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.onboardings.pathFilter()),
    }),
  )
  const p = preview.data
  const done = publish.data
  const envName = environment?.name ?? '…'

  return (
    <Dialog open title="Publish onboarding" onClose={onClose}>
      <Stack>
        {!done && (
          <Field label="Publish to">
            <Select value={environmentId} onChange={(e) => setStored(e.target.value)} disabled={publish.isPending}>
              {environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
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
                <ReleaseChanges diff={p.diff} environment={envName} />
              </>
            )}
            <Checkbox
              label="Offer it again to people who haven't finished it"
              checked={offerAgain}
              onChange={(e) => setOfferAgain(e.target.checked)}
              disabled={p.productionVersion === null}
            />
            <Text>
              {p.productionVersion === null
                ? 'Nothing is in Production yet: version 1.'
                : offerAgain
                  ? `Version ${p.version}: once it is in Production, people who skipped or dismissed version ${p.productionVersion} see it again. People who finished it never do.`
                  : `A silent fix: version stays ${p.version}, as in Production, so nobody sees it again because of this.`}
            </Text>
            {publish.error && <Callout tone="danger">{publish.error.message}</Callout>}
            <Inline>
              <Button
                variant="primary"
                size="lg"
                disabled={p.errors.length > 0 || publish.isPending || preview.isFetching}
                onClick={() => publish.mutate({ projectId, onboardingId, offerAgain, environmentId })}
              >
                {publish.isPending ? 'Publishing…' : `Publish version ${p.version} to ${envName}`}
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
              Published version {done.version} (revision {done.revision}) to {envName} in {done.locales.length}{' '}
              {done.locales.length === 1 ? 'language' : 'languages'}.{' '}
              {environment?.isProduction
                ? "Apps pick it up within about 5 minutes (the proxy's cache)."
                : `Builds reading ${envName} get it on their next request. When it looks right, promote it to Production from the onboarding's page.`}
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
