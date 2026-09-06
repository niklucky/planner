import { type Db, schema } from '@planner/db'
import { and, eq, isNull, sql } from 'drizzle-orm'

/**
 * Ensures a release exists in the app's group for every version string of the
 * app's store versions and links versions that aren't linked yet.
 */
export async function linkVersionsToReleases(db: Db, projectId: string, appId: string) {
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, appId) })
  if (!app) return
  const unlinked = await db
    .selectDistinct({ version: schema.appVersions.versionString })
    .from(schema.appVersions)
    .where(and(eq(schema.appVersions.appId, appId), isNull(schema.appVersions.releaseId)))
  if (unlinked.length === 0) return

  await db
    .insert(schema.releases)
    .values(unlinked.map((u) => ({ projectId, groupId: app.groupId, version: u.version })))
    .onConflictDoNothing({ target: [schema.releases.groupId, schema.releases.version] })

  await db.execute(sql`
    update app_versions v
    set release_id = r.id
    from releases r
    where v.app_id = ${appId}
      and v.release_id is null
      and r.group_id = ${app.groupId}
      and r.version = v.version_string
  `)
}
