import { type Db, schema } from '@planner/db'
import { eq } from 'drizzle-orm'

export function appsService(db: Db) {
  return {
    listForProject(projectId: string) {
      return db.select().from(schema.apps).where(eq(schema.apps.projectId, projectId)).orderBy(schema.apps.createdAt)
    },
  }
}
