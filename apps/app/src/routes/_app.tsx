import { AppShell } from '@planner/frontend'
import { useQuery } from '@tanstack/react-query'
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { CreateProjectDialog } from '../components/create-project-dialog'
import { OrgSidebar } from '../components/org-sidebar'
import { useTRPC } from '../lib/trpc'

/** Signed-in area: loads the current user and their projects, then renders the shell. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(context.trpc.auth.me.queryOptions())
    if (!user) throw redirect({ to: '/login', search: { redirect: location.href } })
    await context.queryClient.ensureQueryData(context.trpc.projects.list.queryOptions())
    return { user }
  },
  component: AppLayout,
})

function AppLayout() {
  const trpc = useTRPC()
  const { data: projects } = useQuery(trpc.projects.list.queryOptions())

  return (
    <AppShell>
      <OrgSidebar />
      <Outlet />
      {projects?.length === 0 && <CreateProjectDialog />}
    </AppShell>
  )
}
