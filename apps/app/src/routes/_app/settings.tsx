import { Main, Page } from '@planner/frontend'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/settings')({
  component: () => (
    <Main>
      <Page title="Settings" />
    </Main>
  ),
})
