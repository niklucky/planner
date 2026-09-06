import type { QueryClient } from '@tanstack/react-query'
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { Trpc } from '../lib/trpc'

interface RouterContext {
  queryClient: QueryClient
  trpc: Trpc
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
})
