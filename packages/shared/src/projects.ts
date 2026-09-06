import { z } from 'zod'

export const MEMBER_ROLES = ['owner', 'member'] as const
export const memberRoleSchema = z.enum(MEMBER_ROLES)
export type MemberRole = z.infer<typeof memberRoleSchema>

export const createProjectInput = z.object({
  name: z.string().trim().min(1, 'Enter a project name').max(120),
})
export type CreateProjectInput = z.infer<typeof createProjectInput>

export const projectIdInput = z.object({ id: z.uuid() })

export interface Project {
  id: string
  name: string
  ownerId: string
}

/** A project as seen by a member, with their role. */
export interface ProjectMembership extends Project {
  role: MemberRole
}

export interface ProjectMember {
  userId: string
  name: string
  email: string
  role: MemberRole
  joinedAt: Date
}

export interface ProjectInvitation {
  id: string
  email: string
  role: MemberRole
  createdAt: Date
  expiresAt: Date
}

export const inviteMemberInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email').max(255)),
  role: z.literal('member').default('member'),
})
export type InviteMemberInput = z.infer<typeof inviteMemberInput>

export const removeMemberInput = z.object({ userId: z.uuid() })
export const invitationIdInput = z.object({ invitationId: z.uuid() })
export const acceptInviteInput = z.object({ token: z.string().min(1) })

/** A pending invitation addressed to the signed-in user's email. */
export interface MyInvitation {
  id: string
  projectId: string
  projectName: string
  inviterName: string | null
  role: MemberRole
  expiresAt: Date
}
