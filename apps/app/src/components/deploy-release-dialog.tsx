import { Button, Callout, Dialog, Inline, Stack, Text } from '@planner/frontend'
import type { DeployPreview } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTRPC } from '../lib/trpc'
import { useEnvironments } from './environments'
import { ReleaseChanges } from './release-changes'

interface Props {
  projectId: string
  onboardingId: string
  releaseId: string
  environmentId: string
  onClose: () => void
}

/** Serves an existing release in an environment: promotes what was tested, or rolls back. Nothing is rebuilt. */
export function DeployReleaseDialog({ projectId, onboardingId, releaseId, environmentId, onClose }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const environment = useEnvironments(projectId).find((e) => e.id === environmentId)
  const input = { projectId, onboardingId, releaseId, environmentId }
  const preview = useQuery(trpc.onboardings.previewDeploy.queryOptions(input, { staleTime: 0 }))
  const deploy = useMutation(
    trpc.onboardings.deploy.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.onboardings.pathFilter()),
    }),
  )
  // What the user confirmed: the preview refetches after deploying and would describe a no-op.
  const [confirmed, setConfirmed] = useState<DeployPreview | null>(null)
  const p = confirmed ?? preview.data
  const envName = environment?.name ?? '…'
  const rollback = !!p?.current && p.release.revision < p.current.revision
  const release = p ? `version ${p.release.version} (revision ${p.release.revision})` : ''
  const title = !p
    ? envName
    : rollback
      ? `Roll ${envName} back to ${release}`
      : `${environment?.isProduction ? 'Promote' : 'Serve'} ${release} to ${envName}`
  const action = rollback ? `Roll back ${envName}` : `${environment?.isProduction ? 'Promote' : 'Serve'} to ${envName}`

  return (
    <Dialog open title={title} onClose={onClose}>
      <Stack>
        {!p && <Text>{preview.error?.message ?? 'Checking…'}</Text>}
        {p && !deploy.isSuccess && (
          <>
            <Text>
              The same release, exactly as it was published: no rebuild.{' '}
              {p.current
                ? `${envName} serves version ${p.current.version} (revision ${p.current.revision}) now.`
                : `${envName} serves nothing yet.`}
            </Text>
            <ReleaseChanges diff={p.diff} environment={envName} />
            <Text>
              {!p.current || p.release.version === p.current.version
                ? `Version ${p.release.version}: nobody sees it again because of this.`
                : p.release.version > p.current.version
                  ? `Version goes from ${p.current.version} to ${p.release.version}: people who skipped or dismissed it see it again. People who finished it never do.`
                  : `Version goes back from ${p.current.version} to ${p.release.version}: nobody sees it again because of this.`}
            </Text>
            {deploy.error && <Callout tone="danger">{deploy.error.message}</Callout>}
            <Inline>
              <Button
                variant="primary"
                size="lg"
                disabled={deploy.isPending || preview.isFetching}
                onClick={() => {
                  setConfirmed(p)
                  deploy.mutate(input, { onError: () => setConfirmed(null) })
                }}
              >
                {deploy.isPending ? 'Working…' : action}
              </Button>
              <Button size="lg" onClick={onClose}>
                Cancel
              </Button>
            </Inline>
          </>
        )}
        {p && deploy.isSuccess && (
          <>
            <Text>
              {envName} serves version {p.release.version} (revision {p.release.revision}) now.{' '}
              {environment?.isProduction
                ? "Apps pick it up within about 5 minutes (the proxy's cache)."
                : `Builds reading ${envName} get it on their next request.`}
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
