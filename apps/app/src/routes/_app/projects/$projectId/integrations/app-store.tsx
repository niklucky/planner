import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { AppStoreIntegration } from '../../../../../components/app-store-integration'
import { useIntegration } from '../../../../../lib/use-integration'

const projectRoute = getRouteApi('/_app/projects/$projectId')

export const Route = createFileRoute('/_app/projects/$projectId/integrations/app-store')({
  component: AppStoreTab,
})

function AppStoreTab() {
  const project = projectRoute.useLoaderData()
  return <AppStoreIntegration projectId={project.id} integration={useIntegration(project.id, 'app_store')} />
}
