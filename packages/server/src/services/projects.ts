import { type Db, schema } from '@planner/db'
import type {
  CreateProjectInput,
  InviteMemberInput,
  MyInvitation,
  ProjectInvitation,
  ProjectMember,
  ProjectMembership,
} from '@planner/shared'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { generateToken, hashToken } from '../auth/tokens'
import type { Mailer } from '../mail'
import { DEFAULT_ENVIRONMENTS } from './environments'

export type ProjectErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'ALREADY_MEMBER'
  | 'INVALID_INVITE'
  | 'EMAIL_MISMATCH'
  | 'MAIL_FAILED'

export class ProjectError extends Error {
  constructor(
    public readonly code: ProjectErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ProjectError'
  }
}

export interface ProjectDeps {
  mailer: Mailer
  appUrl: string
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const membershipColumns = {
  id: schema.projects.id,
  name: schema.projects.name,
  ownerId: schema.projects.ownerId,
  role: schema.projectMembers.role,
}

export function projectsService(db: Db, deps: ProjectDeps) {
  async function requireProject(projectId: string) {
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) })
    if (!project) throw new ProjectError('NOT_FOUND', 'Project not found')
    return project
  }

  return {
    /** Projects the user is a member of, oldest first. */
    listForUser(userId: string): Promise<ProjectMembership[]> {
      return db
        .select(membershipColumns)
        .from(schema.projectMembers)
        .innerJoin(schema.projects, eq(schema.projectMembers.projectId, schema.projects.id))
        .where(eq(schema.projectMembers.userId, userId))
        .orderBy(schema.projects.createdAt)
    },

    /** A single project, or null when it doesn't exist or the user isn't a member. */
    async getForUser(userId: string, projectId: string): Promise<ProjectMembership | null> {
      const [row] = await db
        .select(membershipColumns)
        .from(schema.projectMembers)
        .innerJoin(schema.projects, eq(schema.projectMembers.projectId, schema.projects.id))
        .where(and(eq(schema.projectMembers.userId, userId), eq(schema.projectMembers.projectId, projectId)))
        .limit(1)
      return row ?? null
    },

    /** Creates the project with the user as owner and first member. */
    create(userId: string, input: CreateProjectInput): Promise<ProjectMembership> {
      return db.transaction(async (tx) => {
        const [project] = await tx.insert(schema.projects).values({ name: input.name, ownerId: userId }).returning()
        await tx.insert(schema.projectMembers).values({ projectId: project!.id, userId, role: 'owner' })
        await tx
          .insert(schema.projectEnvironments)
          .values(DEFAULT_ENVIRONMENTS.map((e) => ({ projectId: project!.id, ...e })))
        return { id: project!.id, name: project!.name, ownerId: project!.ownerId, role: 'owner' }
      })
    },

    listMembers(projectId: string): Promise<ProjectMember[]> {
      return db
        .select({
          userId: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          role: schema.projectMembers.role,
          joinedAt: schema.projectMembers.createdAt,
        })
        .from(schema.projectMembers)
        .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
        .where(eq(schema.projectMembers.projectId, projectId))
        .orderBy(schema.projectMembers.createdAt)
    },

    async listInvitations(projectId: string): Promise<ProjectInvitation[]> {
      const rows = await db.query.projectInvitations.findMany({
        where: and(
          eq(schema.projectInvitations.projectId, projectId),
          isNull(schema.projectInvitations.acceptedAt),
          gt(schema.projectInvitations.expiresAt, new Date()),
        ),
        orderBy: schema.projectInvitations.createdAt,
      })
      return rows.map((r) => ({
        id: r.id,
        email: r.email,
        role: r.role,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
      }))
    },

    /**
     * Adds an existing user directly, or emails an invitation link. Re-inviting
     * a pending email issues a fresh link.
     */
    async invite(projectId: string, inviterId: string, input: InviteMemberInput) {
      const project = await requireProject(projectId)
      const existing = await db.query.users.findFirst({ where: eq(schema.users.email, input.email) })
      if (existing) {
        const member = await db.query.projectMembers.findFirst({
          where: and(eq(schema.projectMembers.projectId, projectId), eq(schema.projectMembers.userId, existing.id)),
        })
        if (member) throw new ProjectError('ALREADY_MEMBER', 'Already a member of this project')
      }
      const previous = await db.query.projectInvitations.findFirst({
        where: and(
          eq(schema.projectInvitations.projectId, projectId),
          eq(schema.projectInvitations.email, input.email),
        ),
      })
      const { token, hash } = generateToken()
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
      const [invitation] = await db
        .insert(schema.projectInvitations)
        .values({ projectId, email: input.email, role: input.role, tokenHash: hash, invitedBy: inviterId, expiresAt })
        .onConflictDoUpdate({
          target: [schema.projectInvitations.projectId, schema.projectInvitations.email],
          set: {
            tokenHash: hash,
            role: input.role,
            invitedBy: inviterId,
            expiresAt,
            acceptedAt: null,
            createdAt: new Date(),
          },
        })
        .returning()
      const inviter = await db.query.users.findFirst({ where: eq(schema.users.id, inviterId) })
      const url = `${deps.appUrl}/invite?token=${token}`
      try {
        await deps.mailer.send({
          to: input.email,
          subject: `${inviter?.name ?? 'Someone'} invited you to ${project.name} on Planner`,
          text: `${inviter?.name ?? 'Someone'} invited you to join the project "${project.name}".\n\nAccept the invitation (valid for 7 days):\n\n${url}\n\nIf you don't have an account yet you can create one with this email.`,
        })
      } catch (e) {
        // Don't leave an invitation nobody received: restore the previous one or drop it.
        if (previous) {
          await db
            .update(schema.projectInvitations)
            .set({ tokenHash: previous.tokenHash, expiresAt: previous.expiresAt, acceptedAt: previous.acceptedAt })
            .where(eq(schema.projectInvitations.id, invitation!.id))
        } else {
          await db.delete(schema.projectInvitations).where(eq(schema.projectInvitations.id, invitation!.id))
        }
        throw new ProjectError('MAIL_FAILED', `The invitation email could not be sent: ${(e as Error).message}`)
      }
    },

    async revokeInvitation(projectId: string, invitationId: string) {
      await db
        .delete(schema.projectInvitations)
        .where(and(eq(schema.projectInvitations.id, invitationId), eq(schema.projectInvitations.projectId, projectId)))
    },

    /** Read-only look at an invitation, for the accept page. */
    async previewInvitation(token: string) {
      const invite = await db.query.projectInvitations.findFirst({
        where: and(
          eq(schema.projectInvitations.tokenHash, hashToken(token)),
          isNull(schema.projectInvitations.acceptedAt),
          gt(schema.projectInvitations.expiresAt, new Date()),
        ),
      })
      if (!invite) throw new ProjectError('INVALID_INVITE', 'This invitation is invalid or has expired')
      const project = await requireProject(invite.projectId)
      return { projectId: project.id, projectName: project.name, email: invite.email, role: invite.role }
    },

    /** Pending invitations addressed to the user's email. */
    async listInvitationsForUser(userId: string): Promise<MyInvitation[]> {
      const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
      if (!user) return []
      const rows = await db
        .select({
          id: schema.projectInvitations.id,
          projectId: schema.projects.id,
          projectName: schema.projects.name,
          inviterName: schema.users.name,
          role: schema.projectInvitations.role,
          expiresAt: schema.projectInvitations.expiresAt,
        })
        .from(schema.projectInvitations)
        .innerJoin(schema.projects, eq(schema.projectInvitations.projectId, schema.projects.id))
        .leftJoin(schema.users, eq(schema.projectInvitations.invitedBy, schema.users.id))
        .where(
          and(
            eq(schema.projectInvitations.email, user.email),
            isNull(schema.projectInvitations.acceptedAt),
            gt(schema.projectInvitations.expiresAt, new Date()),
          ),
        )
        .orderBy(schema.projectInvitations.createdAt)
      return rows
    },

    /**
     * Joins the project from an invitation found by link token or by id.
     * The signed-in user's email must match the invitation.
     */
    async acceptInvitation(userId: string, by: { token?: string; invitationId?: string }): Promise<ProjectMembership> {
      const invite = await db.query.projectInvitations.findFirst({
        where: and(
          by.token
            ? eq(schema.projectInvitations.tokenHash, hashToken(by.token))
            : eq(schema.projectInvitations.id, by.invitationId ?? ''),
          isNull(schema.projectInvitations.acceptedAt),
          gt(schema.projectInvitations.expiresAt, new Date()),
        ),
      })
      if (!invite) throw new ProjectError('INVALID_INVITE', 'This invitation is invalid or has expired')
      const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
      if (!user || user.email !== invite.email) {
        throw new ProjectError(
          'EMAIL_MISMATCH',
          `This invitation was sent to ${invite.email}. Sign in with that account to accept it.`,
        )
      }
      await db.transaction(async (tx) => {
        await tx
          .insert(schema.projectMembers)
          .values({ projectId: invite.projectId, userId, role: invite.role })
          .onConflictDoNothing()
        await tx
          .update(schema.projectInvitations)
          .set({ acceptedAt: new Date() })
          .where(eq(schema.projectInvitations.id, invite.id))
      })
      return (await this.getForUser(userId, invite.projectId))!
    },

    /** Removes an invitation addressed to the user. */
    async declineInvitation(userId: string, invitationId: string) {
      const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
      if (!user) throw new ProjectError('NOT_FOUND', 'User not found')
      await db
        .delete(schema.projectInvitations)
        .where(and(eq(schema.projectInvitations.id, invitationId), eq(schema.projectInvitations.email, user.email)))
    },

    /** Removes a member. The owner cannot be removed. */
    async removeMember(projectId: string, userId: string) {
      const project = await requireProject(projectId)
      if (project.ownerId === userId) throw new ProjectError('FORBIDDEN', 'The owner cannot be removed')
      await db
        .delete(schema.projectMembers)
        .where(and(eq(schema.projectMembers.projectId, projectId), eq(schema.projectMembers.userId, userId)))
    },
  }
}
