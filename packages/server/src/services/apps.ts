import { type Db, schema } from '@planner/db'
import { desc, eq } from 'drizzle-orm'

export function appsService(db: Db) {
  return {
    listForProject(projectId: string) {
      return db.select().from(schema.apps).where(eq(schema.apps.projectId, projectId)).orderBy(schema.apps.createdAt)
    },

    /** All synced versions of all apps in the project, newest first. */
    listVersionsForProject(projectId: string) {
      return db
        .select({ version: schema.appVersions })
        .from(schema.appVersions)
        .innerJoin(schema.apps, eq(schema.appVersions.appId, schema.apps.id))
        .where(eq(schema.apps.projectId, projectId))
        .orderBy(desc(schema.appVersions.storeCreatedAt))
        .then((rows) => rows.map((r) => r.version))
    },
  }
}
