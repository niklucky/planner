import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { GooglePlayIntegration } from '../../../../../components/google-play-integration'
import { useIntegration } from '../../../../../lib/use-integration'

const projectRoute = getRouteApi('/_app/projects/$projectId')

export const Route = createFileRoute('/_app/projects/$projectId/integrations/google-play')({
  component: GooglePlayTab,
})

function GooglePlayTab() {
  const project = projectRoute.useLoaderData()
  return <GooglePlayIntegration projectId={project.id} integration={useIntegration(project.id, 'google_play')} />
}
