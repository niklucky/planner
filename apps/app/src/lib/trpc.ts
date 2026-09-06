import type { AppRouter } from '@planner/api'
import { QueryClient } from '@tanstack/react-query'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import { createTRPCContext, createTRPCOptionsProxy } from '@trpc/tanstack-react-query'

export const queryClient = new QueryClient()

export const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/trpc', transformer: superjson })],
})

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>()

/** For use outside components (route loaders, beforeLoad). */
export const trpc = createTRPCOptionsProxy<AppRouter>({ client: trpcClient, queryClient })
export type Trpc = typeof trpc
