import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/projects/$projectId/integrations/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/projects/$projectId/integrations/app-store', params })
  },
})
