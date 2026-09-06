import type { Context as HonoContext } from 'hono'
import { getCookie } from 'hono/cookie'
import { serialize } from 'hono/utils/cookie'

export const SESSION_COOKIE = 'planner_session'

export interface SessionCookie {
  get(): string | undefined
  set(token: string, expiresAt: Date): void
  clear(): void
  /** Set-Cookie header values queued for this response (emitted via tRPC responseMeta). */
  readonly pending: readonly string[]
}

export function sessionCookie(c: HonoContext, secure: boolean): SessionCookie {
  const pending: string[] = []
  const base = { httpOnly: true, sameSite: 'Lax' as const, secure, path: '/' }
  return {
    pending,
    get: () => getCookie(c, SESSION_COOKIE),
    set: (token, expiresAt) => pending.push(serialize(SESSION_COOKIE, token, { ...base, expires: expiresAt })),
    clear: () => pending.push(serialize(SESSION_COOKIE, '', { ...base, maxAge: 0 })),
  }
}
