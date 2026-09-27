import { Button, Inline, Page, Row, Section, Select, Stack, Text } from '@planner/frontend'
import { formatStorePlatform, formatStoreState } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { AppLink } from '../../../../components/nav-link'
import { useTRPC } from '../../../../lib/trpc'

const projectRoute = getRouteApi('/_app/projects/$projectId')
const NEW_GROUP = '__new__'

export const Route = createFileRoute('/_app/projects/$projectId/')({
  loader: ({ context, params }) => {
    const input = { projectId: params.projectId }
    return Promise.all([
      context.queryClient.ensureQueryData(context.trpc.apps.list.queryOptions(input)),
      context.queryClient.ensureQueryData(context.trpc.apps.groups.queryOptions(input)),
      context.queryClient.ensureQueryData(context.trpc.apps.versions.queryOptions(input)),
    ])
  },
  component: ProjectOverview,
})

function ProjectOverview() {
  const project = projectRoute.useLoaderData()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const input = { projectId: project.id }
  const { data: apps = [] } = useQuery(trpc.apps.list.queryOptions(input))
  const { data: groups = [] } = useQuery(trpc.apps.groups.queryOptions(input))
  const { data: versions = [] } = useQuery(trpc.apps.versions.queryOptions(input))

  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.apps.pathFilter()),
      queryClient.invalidateQueries(trpc.releases.pathFilter()),
    ])
  const sync = useMutation(trpc.apps.syncVersions.mutationOptions({ onSuccess: invalidateAll }))
  const move = useMutation(trpc.apps.moveToGroup.mutationOptions({ onSuccess: invalidateAll }))
  const error = sync.error ?? move.error

  if (apps.length === 0) {
    return (
      <Page title="Overview">
        <Section title="Apps">
          <Text>
            No apps yet. Add them from{' '}
            <AppLink to="/projects/$projectId/integrations" params={input}>
              Integrations
            </AppLink>
            .
          </Text>
        </Section>
      </Page>
    )
  }

  return (
    <Page title="Overview">
      {groups.map((group) => (
        <Section key={group.id} title={group.name}>
          {apps
            .filter((app) => app.groupId === group.id)
            .map((app) => {
              const appVersions = versions.filter((v) => v.appId === app.id && v.state !== 'REPLACED_WITH_NEW_VERSION')
              const syncing = sync.isPending && sync.variables?.appId === app.id
              return (
                <Stack key={app.id}>
                  <Row
                    secondary={
                      <Inline>
                        <Select
                          value={app.groupId}
                          aria-label="Group"
                          disabled={move.isPending}
                          onChange={(e) =>
                            move.mutate({
                              ...input,
                              appId: app.id,
                              groupId: e.target.value === NEW_GROUP ? null : e.target.value,
                            })
                          }
                        >
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                          <option value={NEW_GROUP}>New group</option>
                        </Select>
                        <Button onClick={() => sync.mutate({ ...input, appId: app.id })} disabled={syncing}>
                          {syncing ? 'Syncing…' : 'Sync'}
                        </Button>
                      </Inline>
                    }
                  >
                    {app.name} · {app.platform === 'ios' ? 'iOS' : 'Android'}
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
        </Section>
      ))}
      {error && <Text>{error.message}</Text>}
    </Page>
  )
}
