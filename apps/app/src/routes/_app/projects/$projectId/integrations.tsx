import { Page } from '@planner/frontend'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { ApiKeys } from '../../../../components/api-keys'
import { AppStoreIntegration } from '../../../../components/app-store-integration'
import { GooglePlayIntegration } from '../../../../components/google-play-integration'
import { TranslationIntegration } from '../../../../components/translation-integration'
import { useTRPC } from '../../../../lib/trpc'

const projectRoute = getRouteApi('/_app/projects/$projectId')

export const Route = createFileRoute('/_app/projects/$projectId/integrations')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(context.trpc.integrations.list.queryOptions({ projectId: params.projectId })),
  component: IntegrationsPage,
})

function IntegrationsPage() {
  const project = projectRoute.useLoaderData()
  const trpc = useTRPC()
  const { data: integrations = [] } = useQuery(trpc.integrations.list.queryOptions({ projectId: project.id }))
  const appStore = integrations.find((i) => i.provider === 'app_store')
  const googlePlay = integrations.find((i) => i.provider === 'google_play')
  const translation = integrations.find((i) => i.provider === 'translation')

  return (
    <Page title="Integrations">
      <AppStoreIntegration projectId={project.id} integration={appStore} />
      <GooglePlayIntegration projectId={project.id} integration={googlePlay} />
      <TranslationIntegration projectId={project.id} integration={translation} />
      <ApiKeys projectId={project.id} isOwner={project.role === 'owner'} />
    </Page>
  )
}
