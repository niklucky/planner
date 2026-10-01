import { Page } from '@planner/frontend'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { ApiKeys } from '../../../../components/api-keys'

const projectRoute = getRouteApi('/_app/projects/$projectId')

export const Route = createFileRoute('/_app/projects/$projectId/settings')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(context.trpc.onboardings.apiKeys.queryOptions({ projectId: params.projectId })),
  component: SettingsPage,
})

function SettingsPage() {
  const project = projectRoute.useLoaderData()
  return (
    <Page title="Settings">
      <ApiKeys projectId={project.id} isOwner={project.role === 'owner'} />
    </Page>
  )
}
