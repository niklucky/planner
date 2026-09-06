import { AppShell } from '@planner/frontend'
import { useQuery } from '@tanstack/react-query'
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { CreateProjectDialog } from '../components/create-project-dialog'
import { InvitationsDialog } from '../components/invitations-dialog'
import { OrgSidebar } from '../components/org-sidebar'
import { useTRPC } from '../lib/trpc'

/** Signed-in area: loads the current user, their projects and invitations, then renders the shell. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(context.trpc.auth.me.queryOptions())
    if (!user) throw redirect({ to: '/login', search: { redirect: location.href } })
    await Promise.all([
      context.queryClient.ensureQueryData(context.trpc.projects.list.queryOptions()),
      context.queryClient.ensureQueryData(context.trpc.projects.myInvitations.queryOptions()),
    ])
    return { user }
  },
  component: AppLayout,
})

function AppLayout() {
  const trpc = useTRPC()
  const { data: projects } = useQuery(trpc.projects.list.queryOptions())
  const { data: invitations = [] } = useQuery(trpc.projects.myInvitations.queryOptions())
  // "Not now" hides the dialog for this page load only; a reload brings it back.
  const [dismissed, setDismissed] = useState(false)

  const showInvitations = invitations.length > 0 && !dismissed
  const showCreateProject = projects?.length === 0 && !showInvitations

  return (
    <AppShell>
      <OrgSidebar />
      <Outlet />
      {showInvitations && <InvitationsDialog invitations={invitations} onClose={() => setDismissed(true)} />}
      {showCreateProject && <CreateProjectDialog />}
    </AppShell>
  )
}
