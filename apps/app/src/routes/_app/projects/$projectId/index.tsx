import { Page } from '@planner/frontend'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/projects/$projectId/')({
  component: () => <Page title="Overview" />,
})
