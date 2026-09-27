import { type Db, schema } from '@planner/db'
import type { MoveAppToGroupInput } from '@planner/shared'
import { and, desc, eq, notInArray, sql } from 'drizzle-orm'
import { linkVersionsToReleases } from '../releases/link'
import { IntegrationError } from './integrations'

export function appsService(db: Db) {
  return {
    listForProject(projectId: string) {
      return db.select().from(schema.apps).where(eq(schema.apps.projectId, projectId)).orderBy(schema.apps.createdAt)
    },

    listGroups(projectId: string) {
      return db
        .select()
        .from(schema.appGroups)
        .where(eq(schema.appGroups.projectId, projectId))
        .orderBy(schema.appGroups.createdAt)
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

    /**
     * Moves an app to another group (or a fresh one) and re-links its versions to
     * that group's releases. Groups left empty are removed.
     */
    async moveToGroup(projectId: string, input: MoveAppToGroupInput) {
      const app = await db.query.apps.findFirst({
        where: and(eq(schema.apps.id, input.appId), eq(schema.apps.projectId, projectId)),
      })
      if (!app) throw new IntegrationError('NOT_FOUND', 'App not found')

      let groupId = input.groupId
      if (groupId) {
        const group = await db.query.appGroups.findFirst({
          where: and(eq(schema.appGroups.id, groupId), eq(schema.appGroups.projectId, projectId)),
        })
        if (!group) throw new IntegrationError('NOT_FOUND', 'Group not found')
      } else {
        const [group] = await db.insert(schema.appGroups).values({ projectId, name: app.name }).returning()
        groupId = group!.id
      }
      if (groupId === app.groupId) return app

      await db.transaction(async (tx) => {
        await tx.update(schema.apps).set({ groupId: groupId!, updatedAt: new Date() }).where(eq(schema.apps.id, app.id))
        await tx.update(schema.appVersions).set({ releaseId: null }).where(eq(schema.appVersions.appId, app.id))
      })
      await linkVersionsToReleases(db, projectId, app.id)

      // Drop groups that no longer contain any app.
      const used = db.select({ id: schema.apps.groupId }).from(schema.apps).where(eq(schema.apps.projectId, projectId))
      await db
        .delete(schema.appGroups)
        .where(and(eq(schema.appGroups.projectId, projectId), notInArray(schema.appGroups.id, used)))

      return (await db.query.apps.findFirst({ where: eq(schema.apps.id, app.id) }))!
    },

    async renameGroup(projectId: string, groupId: string, name: string) {
      const [row] = await db
        .update(schema.appGroups)
        .set({ name, updatedAt: sql`now()` })
        .where(and(eq(schema.appGroups.id, groupId), eq(schema.appGroups.projectId, projectId)))
        .returning()
      if (!row) throw new IntegrationError('NOT_FOUND', 'Group not found')
      return row
    },
  }
}
