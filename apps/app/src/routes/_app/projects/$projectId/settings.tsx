import { Page } from '@planner/frontend'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { ApiKeys } from '../../../../components/api-keys'
import { Environments } from '../../../../components/environments'

const projectRoute = getRouteApi('/_app/projects/$projectId')

export const Route = createFileRoute('/_app/projects/$projectId/settings')({
  loader: ({ context, params }) => {
    const input = { projectId: params.projectId }
    return Promise.all([
      context.queryClient.ensureQueryData(context.trpc.onboardings.apiKeys.queryOptions(input)),
      context.queryClient.ensureQueryData(context.trpc.environments.list.queryOptions(input)),
    ])
  },
  component: SettingsPage,
})

function SettingsPage() {
  const project = projectRoute.useLoaderData()
  return (
    <Page title="Settings">
      <Environments projectId={project.id} isOwner={project.role === 'owner'} />
      <ApiKeys projectId={project.id} isOwner={project.role === 'owner'} />
    </Page>
  )
}
