import type { IntegrationProvider } from '@planner/shared'
import { useQuery } from '@tanstack/react-query'
import { useTRPC } from './trpc'

/** The project's integration for one provider, if it has one. */
export function useIntegration(projectId: string, provider: IntegrationProvider) {
  const trpc = useTRPC()
  const { data: integrations = [] } = useQuery(trpc.integrations.list.queryOptions({ projectId }))
  return integrations.find((i) => i.provider === provider)
}
