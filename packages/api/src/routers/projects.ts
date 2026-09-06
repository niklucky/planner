import { createProjectInput, projectIdInput } from '@planner/shared'
import { TRPCError } from '@trpc/server'
import { protectedProcedure, router } from '../trpc'

export const projectsRouter = router({
  list: protectedProcedure.query(({ ctx }) => ctx.services.projects.listForUser(ctx.user.id)),

  get: protectedProcedure.input(projectIdInput).query(async ({ ctx, input }) => {
    const project = await ctx.services.projects.getForUser(ctx.user.id, input.id)
    if (!project) throw new TRPCError({ code: 'NOT_FOUND' })
    return project
  }),

  create: protectedProcedure
    .input(createProjectInput)
    .mutation(({ ctx, input }) => ctx.services.projects.create(ctx.user.id, input)),
})
