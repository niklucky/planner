import { type Db, schema } from '@planner/db'
import { type Environment, sortEnvironments } from '@planner/shared'
import { and, eq } from 'drizzle-orm'

export type EnvironmentErrorCode = 'NOT_FOUND' | 'INVALID' | 'CONFLICT'

export class EnvironmentError extends Error {
  constructor(
    public readonly code: EnvironmentErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'EnvironmentError'
  }
}

/** What every project starts with. */
export const DEFAULT_ENVIRONMENTS = [
  { name: 'Production', isProduction: true },
  { name: 'Development', isProduction: false },
] as const

const toEnvironment = (r: typeof schema.projectEnvironments.$inferSelect): Environment => ({
  id: r.id,
  name: r.name,
  isProduction: r.isProduction,
  createdAt: r.createdAt,
})

export function environmentsService(db: Db) {
  async function requireEnvironment(projectId: string, environmentId: string) {
    const row = await db.query.projectEnvironments.findFirst({
      where: and(eq(schema.projectEnvironments.id, environmentId), eq(schema.projectEnvironments.projectId, projectId)),
    })
    if (!row) throw new EnvironmentError('NOT_FOUND', 'Environment not found')
    return row
  }

  async function assertNameFree(projectId: string, name: string, exceptId?: string) {
    const rows = await db
      .select({ id: schema.projectEnvironments.id, name: schema.projectEnvironments.name })
      .from(schema.projectEnvironments)
      .where(eq(schema.projectEnvironments.projectId, projectId))
    const clash = rows.find((r) => r.name.toLowerCase() === name.toLowerCase() && r.id !== exceptId)
    if (clash) throw new EnvironmentError('CONFLICT', `There is already an environment called ${clash.name}`)
  }

  return {
    async list(projectId: string): Promise<Environment[]> {
      const rows = await db
        .select()
        .from(schema.projectEnvironments)
        .where(eq(schema.projectEnvironments.projectId, projectId))
      return sortEnvironments(rows.map(toEnvironment))
    },

    async create(projectId: string, name: string): Promise<Environment> {
      await assertNameFree(projectId, name)
      const [row] = await db.insert(schema.projectEnvironments).values({ projectId, name }).returning()
      return toEnvironment(row!)
    },

    async rename(projectId: string, environmentId: string, name: string): Promise<Environment> {
      const env = await requireEnvironment(projectId, environmentId)
      await assertNameFree(projectId, name, env.id)
      const [row] = await db
        .update(schema.projectEnvironments)
        .set({ name })
        .where(eq(schema.projectEnvironments.id, env.id))
        .returning()
      return toEnvironment(row!)
    },

    /** Its deployments go with it. Refused while API keys still point at it: they'd stop working. */
    async remove(projectId: string, environmentId: string) {
      const env = await requireEnvironment(projectId, environmentId)
      if (env.isProduction) throw new EnvironmentError('INVALID', 'Production can’t be deleted')
      const key = await db.query.projectApiKeys.findFirst({
        where: eq(schema.projectApiKeys.environmentId, env.id),
      })
      if (key) throw new EnvironmentError('INVALID', `Revoke the API keys of ${env.name} first`)
      await db.delete(schema.projectEnvironments).where(eq(schema.projectEnvironments.id, env.id))
    },
  }
}

export type EnvironmentsService = ReturnType<typeof environmentsService>
