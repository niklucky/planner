import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/projects/$projectId/stores/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/projects/$projectId/stores/releases', params })
  },
})
