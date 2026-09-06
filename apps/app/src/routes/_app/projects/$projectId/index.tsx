import { Page, Row, Section, Stack, Text } from '@planner/frontend'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { AppLink } from '../../../../components/nav-link'
import { useTRPC } from '../../../../lib/trpc'

const projectRoute = getRouteApi('/_app/projects/$projectId')

export const Route = createFileRoute('/_app/projects/$projectId/')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(context.trpc.apps.list.queryOptions({ projectId: params.projectId })),
  component: ProjectOverview,
})

function ProjectOverview() {
  const project = projectRoute.useLoaderData()
  const trpc = useTRPC()
  const { data: apps = [] } = useQuery(trpc.apps.list.queryOptions({ projectId: project.id }))

  return (
    <Page title="Overview">
      <Section title="Apps">
        {apps.length === 0 ? (
          <Text>
            No apps yet. Add them from{' '}
            <AppLink to="/projects/$projectId/integrations" params={{ projectId: project.id }}>
              Integrations
            </AppLink>
            .
          </Text>
        ) : (
          <Stack>
            {apps.map((app) => (
              <Row key={app.id} secondary={`${app.platform === 'ios' ? 'iOS' : 'Android'} · ${app.bundleId}`}>
                {app.name}
              </Row>
            ))}
          </Stack>
        )}
      </Section>
    </Page>
  )
}
