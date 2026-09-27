import { Main, Page } from '@planner/frontend'
import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'
import { TRPCClientError } from '@trpc/client'
import { ProjectNav } from '../../../components/project-nav'

export const Route = createFileRoute('/_app/projects/$projectId')({
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(context.trpc.projects.get.queryOptions({ id: params.projectId }))
    } catch (e) {
      // NOT_FOUND: no such project or not a member. BAD_REQUEST: id isn't a uuid.
      if (e instanceof TRPCClientError && ['NOT_FOUND', 'BAD_REQUEST'].includes(e.data?.code)) throw notFound()
      throw e
    }
  },
  component: ProjectLayout,
  notFoundComponent: () => (
    <Main>
      <Page title="Project not found" />
    </Main>
  ),
})

function ProjectLayout() {
  const project = Route.useLoaderData()
  return (
    <>
      <ProjectNav project={project} />
      <Main>
        <Outlet />
      </Main>
    </>
  )
}
