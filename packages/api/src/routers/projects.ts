import { ProjectError, type ProjectErrorCode } from '@planner/server'
import {
  acceptInviteInput,
  createProjectInput,
  invitationIdInput,
  inviteMemberInput,
  projectIdInput,
  removeMemberInput,
} from '@planner/shared'
import { TRPCError } from '@trpc/server'
import { type Context, projectProcedure, protectedProcedure, publicProcedure, router } from '../trpc'

const codes: Record<ProjectErrorCode, TRPCError['code']> = {
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  ALREADY_MEMBER: 'CONFLICT',
  INVALID_INVITE: 'BAD_REQUEST',
  EMAIL_MISMATCH: 'FORBIDDEN',
  MAIL_FAILED: 'BAD_GATEWAY',
}

function rethrow(e: unknown): never {
  if (e instanceof ProjectError) throw new TRPCError({ code: codes[e.code], message: e.message, cause: e })
  throw e
}

function requireOwner(ctx: Context & { project: { role: string } }) {
  if (ctx.project.role !== 'owner') throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the project owner can do this' })
}

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

  members: projectProcedure.query(({ ctx }) => ctx.services.projects.listMembers(ctx.project.id)),

  invitations: projectProcedure.query(({ ctx }) => ctx.services.projects.listInvitations(ctx.project.id)),

  invite: projectProcedure.input(inviteMemberInput).mutation(({ ctx, input }) => {
    requireOwner(ctx)
    return ctx.services.projects
      .invite(ctx.project.id, ctx.user.id, { email: input.email, role: input.role })
      .catch(rethrow)
  }),

  revokeInvitation: projectProcedure.input(invitationIdInput).mutation(({ ctx, input }) => {
    requireOwner(ctx)
    return ctx.services.projects.revokeInvitation(ctx.project.id, input.invitationId)
  }),

  removeMember: projectProcedure.input(removeMemberInput).mutation(({ ctx, input }) => {
    requireOwner(ctx)
    return ctx.services.projects.removeMember(ctx.project.id, input.userId).catch(rethrow)
  }),

  /** Public: whoever holds the link may see which project and email it is for. */
  previewInvite: publicProcedure
    .input(acceptInviteInput)
    .query(({ ctx, input }) => ctx.services.projects.previewInvitation(input.token).catch(rethrow)),

  acceptInvite: protectedProcedure
    .input(acceptInviteInput)
    .mutation(({ ctx, input }) => ctx.services.projects.acceptInvitation(ctx.user.id, { token: input.token }).catch(rethrow)),

  /** Invitations addressed to the signed-in user's email. */
  myInvitations: protectedProcedure.query(({ ctx }) => ctx.services.projects.listInvitationsForUser(ctx.user.id)),

  acceptMyInvitation: protectedProcedure
    .input(invitationIdInput)
    .mutation(({ ctx, input }) =>
      ctx.services.projects.acceptInvitation(ctx.user.id, { invitationId: input.invitationId }).catch(rethrow),
    ),

  declineMyInvitation: protectedProcedure
    .input(invitationIdInput)
    .mutation(({ ctx, input }) => ctx.services.projects.declineInvitation(ctx.user.id, input.invitationId).catch(rethrow)),
})
