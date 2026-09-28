import type { Services } from '@planner/server'
import { describe, expect, it } from 'vitest'
import { publicApi } from './public'

/** Two projects publish the same key with different content; the key picks the project. */
function fakeServices() {
  const onboardings = {
    async publicDocument(token: string, key: string, _locale: string | undefined, base: string) {
      if (token !== 'plk_a' && token !== 'plk_b') return { status: 401 as const }
      if (key !== 'intro') return { status: 404 as const }
      return {
        status: 200 as const,
        document: { id: key, version: 1, locale: 'en', pages: [], project: token, base },
        etag: `"${token}.${base}"`,
      }
    },
    async publicFile() {
      return null
    },
  }
  return { onboardings } as unknown as Services
}

const get = (path: string, headers: Record<string, string> = {}) =>
  publicApi(fakeServices(), 'https://planner.test/public/v1').request(path, { headers })

describe('public onboarding documents', () => {
  it('tells shared caches to keep one copy per key and proxy mount', async () => {
    for (const token of ['plk_a', 'plk_b']) {
      const res = await get('/onboardings/intro?locale=en', { authorization: `Bearer ${token}` })
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('public, max-age=300')
      expect(res.headers.get('vary')).toMatch(/Authorization/)
      expect(res.headers.get('vary')).toMatch(/X-Forwarded-Prefix/)
      expect(((await res.json()) as { project: string }).project).toBe(token)
    }
    const missing = await get('/onboardings/other', { authorization: 'Bearer plk_a' })
    expect(missing.status).toBe(404)
    expect(missing.headers.get('vary')).toMatch(/Authorization/)
  })

  it('does not let caches keep answers without a valid key', async () => {
    for (const headers of [{}, { authorization: 'Bearer nope' }] as Record<string, string>[]) {
      const res = await get('/onboardings/intro', headers)
      expect(res.status).toBe(401)
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('answers 304 with the same caching headers for a matching ETag', async () => {
    const first = await get('/onboardings/intro', { authorization: 'Bearer plk_a' })
    const again = await get('/onboardings/intro', {
      authorization: 'Bearer plk_a',
      'if-none-match': first.headers.get('etag')!,
    })
    expect(again.status).toBe(304)
    expect(again.headers.get('vary')).toMatch(/Authorization/)
  })

  it('builds media URLs from the proxy mount only when both host and prefix are given', async () => {
    const auth = { authorization: 'Bearer plk_a' }
    const base = async (headers: Record<string, string>) =>
      ((await (await get('/onboardings/intro', { ...auth, ...headers })).json()) as { base: string }).base
    expect(await base({ 'x-forwarded-host': 'app.example.com', 'x-forwarded-prefix': '/content' })).toBe(
      'https://app.example.com/content',
    )
    expect(await base({ 'x-forwarded-host': 'app.example.com' })).toBe('https://planner.test/public/v1')
    expect(await base({ 'x-forwarded-host': 'evil.com/x', 'x-forwarded-prefix': '/content' })).toBe(
      'https://planner.test/public/v1',
    )
  })
})
