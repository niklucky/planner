import type { Services } from '@planner/server'
import { Hono } from 'hono'

/** Plain REST routes (webhooks, integrations, public endpoints). */
export function rest(_services: Services) {
  const r = new Hono()
  r.get('/health', (c) => c.json({ status: 'ok' }))
  return r
}
