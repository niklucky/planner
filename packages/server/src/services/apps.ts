import { type Db, schema } from '@planner/db'
import type { CreateAppInput } from '@planner/shared'

export function appsService(db: Db) {
  return {
    list() {
      return db.select().from(schema.apps).orderBy(schema.apps.createdAt)
    },
    async create(input: CreateAppInput) {
      const [row] = await db.insert(schema.apps).values(input).returning()
      return row!
    },
  }
}
