import { Page, Tabs } from '@planner/frontend'
import { createFileRoute, getRouteApi, Outlet } from '@tanstack/react-router'
import { Languages } from 'lucide-react'
import { AppleIcon, GooglePlayIcon } from '../../../../components/brand-icons'
import { TabLink } from '../../../../components/nav-link'

const projectRoute = getRouteApi('/_app/projects/$projectId')

export const Route = createFileRoute('/_app/projects/$projectId/integrations')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(context.trpc.integrations.list.queryOptions({ projectId: params.projectId })),
  component: IntegrationsLayout,
})

function IntegrationsLayout() {
  const project = projectRoute.useLoaderData()
  const params = { projectId: project.id }
  return (
    <Page title="Integrations">
      <Tabs>
        <TabLink to="/projects/$projectId/integrations/app-store" params={params}>
          <AppleIcon />
          App Store
        </TabLink>
        <TabLink to="/projects/$projectId/integrations/google-play" params={params}>
          <GooglePlayIcon />
          Google Play
        </TabLink>
        <TabLink to="/projects/$projectId/integrations/translation" params={params}>
          <Languages />
          Translation
        </TabLink>
      </Tabs>
      <Outlet />
    </Page>
  )
}
