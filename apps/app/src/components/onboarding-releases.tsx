import { Badge, Button, Inline, Menu, MenuItem, Row, Stack, Text } from '@planner/frontend'
import type { OnboardingDetail } from '@planner/shared'
import { useQuery } from '@tanstack/react-query'
import { useTRPC } from '../lib/trpc'
import { useEnvironments } from './environments'
import { type DeployTarget, shortDate } from './onboarding-environments'

interface Props {
  projectId: string
  detail: OnboardingDetail
  onDeploy: (target: DeployTarget) => void
}

/** Every release, where each one is served, and a way to serve any of them anywhere (e.g. roll back). */
export function OnboardingReleases({ projectId, detail, onDeploy }: Props) {
  const trpc = useTRPC()
  const environments = useEnvironments(projectId)
  const { data: releases } = useQuery(
    trpc.onboardings.releases.queryOptions({ projectId, onboardingId: detail.draft.id }),
  )
  if (!releases) return null
  if (releases.length === 0) return <Text>Nothing published yet.</Text>

  const servedIn = (releaseId: string) =>
    detail.deployments.filter((d) => d.release?.id === releaseId).map((d) => d.environmentId)

  return (
    <Stack>
      {releases.map((r) => {
        // Anywhere it isn't served as that environment's own release (one following production may serve it already).
        const targets = environments.filter(
          (e) =>
            !detail.deployments.some((d) => d.environmentId === e.id && d.release?.id === r.id && !d.followsProduction),
        )
        return (
          <Row
            key={r.id}
            secondary={
              targets.length > 0 && (
                <Menu placement="bottom-end" trigger={<Button size="sm">Serve in…</Button>}>
                  {targets.map((e) => (
                    <MenuItem key={e.id} onSelect={() => onDeploy({ releaseId: r.id, environmentId: e.id })}>
                      {e.name}
                    </MenuItem>
                  ))}
                </Menu>
              )
            }
          >
            <Inline>
              <strong>
                Version {r.version} · revision {r.revision}
              </strong>
              <span title={r.locales.join(', ')}>
                {r.locales.length} {r.locales.length === 1 ? 'language' : 'languages'} · {shortDate(r.publishedAt)}
              </span>
              {servedIn(r.id).map((id) => {
                const env = environments.find((e) => e.id === id)
                return (
                  env && (
                    <Badge key={id} tone={env.isProduction ? 'success' : 'neutral'}>
                      {env.name}
                    </Badge>
                  )
                )
              })}
            </Inline>
          </Row>
        )
      })}
    </Stack>
  )
}
