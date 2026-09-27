import { serveStatic } from '@hono/node-server/serve-static'
import { trpcServer } from '@hono/trpc-server'
import type { Services } from '@planner/server'
import { Hono } from 'hono'
import { publicApi } from './public'
import { rest } from './rest'
import { appRouter } from './routers'
import { sessionCookie } from './session-cookie'

export interface AppOptions {
  /** When set, serves the built web app with SPA fallback. */
  staticDir?: string
  /** Mark the session cookie Secure (HTTPS only). */
  secureCookies?: boolean
  /** Public URL of the app (APP_URL); the public API answers under /public/v1 of it. */
  appUrl?: string
}

export function createApp(services: Services, opts: AppOptions = {}) {
  const app = new Hono()
  const publicUrl = `${(opts.appUrl ?? 'http://localhost:3000').replace(/\/$/, '')}/public/v1`

  app.route('/api', rest(services))
  app.route('/public/v1', publicApi(services, publicUrl))
  app.use(
    '/trpc/*',
    trpcServer({
      router: appRouter,
      endpoint: '/trpc',
      createContext: (_opts, c) => ({
        services,
        session: sessionCookie(c, opts.secureCookies ?? false),
        publicUrl,
      }),
      responseMeta: ({ ctx }) => {
        const headers = new Headers()
        for (const value of ctx?.session.pending ?? []) headers.append('set-cookie', value)
        return { headers }
      },
    }),
  )

  // Unknown API paths must not fall through to the SPA's index.html.
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))
  app.all('/trpc/*', (c) => c.json({ error: 'Not found' }, 404))
  app.all('/public/*', (c) => c.json({ error: 'Not found' }, 404))

  if (opts.staticDir) {
    app.use('*', serveStatic({ root: opts.staticDir }))
    app.get('*', serveStatic({ path: `${opts.staticDir}/index.html` }))
  }

  return app
}
