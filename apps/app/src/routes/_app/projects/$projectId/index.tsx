import { Button, Page, Row, Section, Stack, Text } from '@planner/frontend'
import { formatStorePlatform, formatStoreState } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { AppLink } from '../../../../components/nav-link'
import { useTRPC } from '../../../../lib/trpc'

const projectRoute = getRouteApi('/_app/projects/$projectId')

export const Route = createFileRoute('/_app/projects/$projectId/')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(context.trpc.apps.list.queryOptions({ projectId: params.projectId })),
      context.queryClient.ensureQueryData(context.trpc.apps.versions.queryOptions({ projectId: params.projectId })),
    ]),
  component: ProjectOverview,
})

function ProjectOverview() {
  const project = projectRoute.useLoaderData()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: apps = [] } = useQuery(trpc.apps.list.queryOptions({ projectId: project.id }))
  const { data: versions = [] } = useQuery(trpc.apps.versions.queryOptions({ projectId: project.id }))

  const sync = useMutation(
    trpc.apps.syncVersions.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.apps.versions.queryFilter({ projectId: project.id })),
    }),
  )

  return (
    <Page title="Overview">
      <Section title="Apps">
        {apps.length === 0 && (
          <Text>
            No apps yet. Add them from{' '}
            <AppLink to="/projects/$projectId/integrations" params={{ projectId: project.id }}>
              Integrations
            </AppLink>
            .
          </Text>
        )}
        {apps.map((app) => {
          // Full history stays in the database; the overview shows what's current.
          const appVersions = versions.filter((v) => v.appId === app.id && v.state !== 'REPLACED_WITH_NEW_VERSION')
          const syncing = sync.isPending && sync.variables?.appId === app.id
          return (
            <Stack key={app.id}>
              <Row
                secondary={
                  <Button onClick={() => sync.mutate({ projectId: project.id, appId: app.id })} disabled={syncing}>
                    {syncing ? 'Syncing…' : 'Sync'}
                  </Button>
                }
              >
                {app.name}
              </Row>
              <Stack inset>
                {appVersions.length === 0 && <Text>No versions synced yet.</Text>}
                {appVersions.map((v) => (
                  <Row key={v.id} secondary={formatStoreState(v.state)}>
                    {v.versionString} · {formatStorePlatform(v.platform)}
                  </Row>
                ))}
              </Stack>
            </Stack>
          )
        })}
        {sync.error && <Text>{sync.error.message}</Text>}
      </Section>
    </Page>
  )
}
