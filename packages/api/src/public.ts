import type { Services } from '@planner/server'
import { Hono, type Context as HonoContext } from 'hono'

const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i
const PREFIX = /^(\/[A-Za-z0-9._~-]+)*$/

/**
 * Root that media URLs are made absolute against. An app's proxy (nginx in front of
 * the app's own domain) says where it mounts us with X-Forwarded-Host and
 * X-Forwarded-Prefix, so files resolve through the same origin as the document;
 * reached directly, it is our own public URL.
 */
export function publicBase(c: HonoContext, fallback: string) {
  const host = c.req.header('x-forwarded-host')?.split(',')[0]?.trim()
  const prefix = c.req.header('x-forwarded-prefix')?.split(',')[0]?.trim()
  if (!host || prefix === undefined || !HOST.test(host) || !PREFIX.test(prefix)) return fallback
  const proto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() === 'http' ? 'http' : 'https'
  return `${proto}://${host}${prefix}`
}

/**
 * A document depends on the key (which project answers) and on where the proxy mounts
 * us (media URLs), so shared caches must keep one copy per combination.
 */
const DOCUMENT_VARY = 'Authorization, X-Forwarded-Host, X-Forwarded-Prefix, X-Forwarded-Proto'

function bearer(c: HonoContext) {
  return c.req
    .header('authorization')
    ?.match(/^Bearer\s+(\S+)\s*$/i)?.[1]
    ?.trim()
}

/** True when an If-None-Match header lists this ETag (or `*`). */
function notModified(c: HonoContext, etag: string) {
  const header = c.req.header('if-none-match')
  if (!header) return false
  return header.split(',').some((tag) => {
    const t = tag.trim()
    return t === '*' || t === etag || t === `W/${etag}`
  })
}

/**
 * Read-only API for apps: published onboardings and the files they refer to. Mounted
 * at /public/v1. Documents need a project API key; files are public by hash.
 */
export function publicApi(services: Services, publicUrl: string) {
  const r = new Hono()

  r.get('/onboardings/:key', async (c) => {
    const token = bearer(c)
    if (!token) return c.json({ error: 'Unauthorized' }, 401, { 'cache-control': 'no-store' })
    const result = await services.onboardings.publicDocument(
      token,
      c.req.param('key'),
      c.req.query('locale'),
      publicBase(c, publicUrl),
    )
    if (result.status === 401) return c.json({ error: 'Unauthorized' }, 401, { 'cache-control': 'no-store' })
    if (result.status === 404)
      return c.json({ error: 'Not found' }, 404, { 'cache-control': 'public, max-age=60', vary: DOCUMENT_VARY })
    const headers = { etag: result.etag, 'cache-control': 'public, max-age=300', vary: DOCUMENT_VARY }
    if (notModified(c, result.etag)) return c.body(null, 304, headers)
    return c.json(result.document, 200, headers)
  })

  r.get('/files/:sha256', async (c) => {
    const found = await services.onboardings.publicFile(c.req.param('sha256'))
    if (!found) return c.json({ error: 'Not found' }, 404, { 'cache-control': 'public, max-age=60' })
    const etag = `"${found.file.sha256}"`
    const headers = { etag, 'cache-control': 'public, max-age=31536000, immutable' }
    if (notModified(c, etag)) return c.body(null, 304, headers)
    return c.body(found.bytes as unknown as ArrayBuffer, 200, {
      ...headers,
      'content-type': found.file.contentType,
      'content-length': String(found.file.size),
    })
  })

  return r
}
