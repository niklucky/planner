import { Main, Page } from '@planner/frontend'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { ProjectNav } from '../../../components/project-nav'
import { projects } from '../../../data/projects'

export const Route = createFileRoute('/_app/projects/$projectId')({
  loader: ({ params }) => {
    const project = projects.find((p) => p.id === params.projectId)
    if (!project) throw notFound()
    return project
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
