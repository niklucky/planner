import { AppShell } from '@planner/frontend'
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { OrgSidebar } from '../components/org-sidebar'

/** Signed-in area: loads the current user once and renders the shell. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(context.trpc.auth.me.queryOptions())
    if (!user) throw redirect({ to: '/login', search: { redirect: location.href } })
    return { user }
  },
  component: () => (
    <AppShell>
      <OrgSidebar />
      <Outlet />
    </AppShell>
  ),
})
