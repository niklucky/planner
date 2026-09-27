import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

/** Signed-out pages. Already signed-in users are sent to the app. */
export const Route = createFileRoute('/_auth')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(context.trpc.auth.me.queryOptions())
    if (user) throw redirect({ to: '/' })
  },
  component: () => <Outlet />,
})
