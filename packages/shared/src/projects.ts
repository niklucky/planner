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
