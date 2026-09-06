import { createAppInput } from '@planner/shared'
import { protectedProcedure, router } from '../trpc'

export const appsRouter = router({
  list: protectedProcedure.query(({ ctx }) => ctx.services.apps.list()),
  create: protectedProcedure.input(createAppInput).mutation(({ ctx, input }) => ctx.services.apps.create(input)),
})
