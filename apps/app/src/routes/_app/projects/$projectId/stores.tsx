import { Page, Tabs } from '@planner/frontend'
import { Outlet, createFileRoute, getRouteApi } from '@tanstack/react-router'
import { TabLink } from '../../../../components/nav-link'

const projectRoute = getRouteApi('/_app/projects/$projectId')

export const Route = createFileRoute('/_app/projects/$projectId/stores')({
  component: StoresLayout,
})

function StoresLayout() {
  const project = projectRoute.useLoaderData()
  return (
    <Page title="Stores" wide>
      <Tabs>
        <TabLink to="/projects/$projectId/stores/releases" params={{ projectId: project.id }}>
          Releases
        </TabLink>
      </Tabs>
      <Outlet />
    </Page>
  )
}
