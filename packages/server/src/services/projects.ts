import { type Db, schema } from '@planner/db'
import type { CreateProjectInput, ProjectMembership } from '@planner/shared'
import { and, eq } from 'drizzle-orm'

const membershipColumns = {
  id: schema.projects.id,
  name: schema.projects.name,
  ownerId: schema.projects.ownerId,
  role: schema.projectMembers.role,
}

export function projectsService(db: Db) {
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
        return { id: project!.id, name: project!.name, ownerId: project!.ownerId, role: 'owner' }
      })
    },
  }
}
