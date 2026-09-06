import type { Services, UploadedFile } from '@planner/server'
import { screenshotSlotInput } from '@planner/shared'
import { type Context as HonoContext, Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { SESSION_COOKIE } from './session-cookie'

/** Plain REST routes: health, file uploads and downloads. */
export function rest(services: Services) {
  const r = new Hono()

  /** Resolves the signed-in member of a project, or null. */
  async function member(c: HonoContext, projectId: string) {
    const token = getCookie(c, SESSION_COOKIE)
    const user = token ? await services.auth.getUserBySession(token) : null
    if (!user) return null
    return services.projects.getForUser(user.id, projectId)
  }

  r.get('/health', (c) => c.json({ status: 'ok' }))

  r.get('/files/:fileId', async (c) => {
    const projectId = c.req.query('project')
    if (!projectId) return c.json({ error: 'project query parameter is required' }, 400)
    if (!(await member(c, projectId))) return c.json({ error: 'Unauthorized' }, 401)
    const found = await services.screenshots.getFile(projectId, c.req.param('fileId'))
    if (!found) return c.json({ error: 'Not found' }, 404)
    return c.body(found.bytes as unknown as ArrayBuffer, 200, {
      'content-type': found.file.contentType,
      'content-length': String(found.file.size),
      'cache-control': 'private, max-age=31536000, immutable',
    })
  })

  r.post('/projects/:projectId/releases/:releaseId/screenshots', async (c) => {
    const { projectId, releaseId } = c.req.param()
    if (!(await member(c, projectId))) return c.json({ error: 'Unauthorized' }, 401)
    const form = await c.req.formData()
    const slot = screenshotSlotInput.safeParse({
      platform: form.get('platform'),
      locale: form.get('locale'),
      deviceType: form.get('deviceType'),
    })
    if (!slot.success) return c.json({ error: 'Invalid slot' }, 400)
    const uploads: UploadedFile[] = []
    for (const entry of form.getAll('files')) {
      if (entry instanceof File) uploads.push({ name: entry.name, bytes: new Uint8Array(await entry.arrayBuffer()) })
    }
    if (uploads.length === 0) return c.json({ error: 'No files' }, 400)
    try {
      return c.json(await services.screenshots.add(projectId, releaseId, slot.data, uploads))
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400)
    }
  })

  return r
}
