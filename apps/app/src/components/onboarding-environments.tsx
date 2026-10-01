import { Badge, Button, Callout, Inline, Row, Stack } from '@planner/frontend'
import type { OnboardingDeployment, OnboardingDetail } from '@planner/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '../lib/trpc'
import { useEnvironments } from './environments'

export interface DeployTarget {
  releaseId: string
  environmentId: string
}

interface Props {
  projectId: string
  detail: OnboardingDetail
  onDeploy: (target: DeployTarget) => void
}

export const shortDate = (d: Date) => d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const describe = (d: OnboardingDeployment) => {
  const what = d.release ? `version ${d.release.version} · revision ${d.release.revision}` : 'nothing published yet'
  if (d.followsProduction) return `follows Production: ${what}`
  return d.deployedAt ? `${what} · since ${shortDate(d.deployedAt)}` : what
}

/** What each environment serves of this onboarding, with promote and follow-production actions. */
export function OnboardingEnvironments({ projectId, detail, onDeploy }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const environments = useEnvironments(projectId)
  const follow = useMutation(
    trpc.onboardings.followProduction.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.onboardings.pathFilter()),
    }),
  )
  const production = environments.find((e) => e.isProduction)
  const productionRelease = detail.deployments.find((d) => d.environmentId === production?.id)?.release ?? null

  return (
    <Stack>
      {detail.deployments.map((d) => {
        const env = environments.find((e) => e.id === d.environmentId)
        if (!env) return null
        const own = !env.isProduction && !d.followsProduction && d.release
        const differs = own && d.release!.id !== productionRelease?.id
        return (
          <Row
            key={d.environmentId}
            secondary={
              own && (
                <Inline>
                  {differs && production && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onDeploy({ releaseId: d.release!.id, environmentId: production.id })}
                    >
                      Promote to {production.name}…
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={follow.isPending}
                    onClick={() => {
                      if (confirm(`Make ${env.name} serve what ${production?.name ?? 'Production'} serves again?`))
                        follow.mutate({ projectId, onboardingId: detail.draft.id, environmentId: env.id })
                    }}
                  >
                    Follow {production?.name ?? 'Production'}
                  </Button>
                </Inline>
              )
            }
          >
            <strong>{env.name}</strong> · {describe(d)}{' '}
            {differs && <Badge tone="warning">differs from {production?.name}</Badge>}
          </Row>
        )
      })}
      {follow.error && <Callout tone="danger">{follow.error.message}</Callout>}
    </Stack>
  )
}
