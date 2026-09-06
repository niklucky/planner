import type { AppStoreCredentials, RemoteApp } from '@planner/shared'
import { TOKEN_TTL_SECONDS, createAppStoreToken } from './token'

const BASE_URL = 'https://api.appstoreconnect.apple.com'

export class AppStoreError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'AppStoreError'
  }
}

interface AppleErrorBody {
  errors?: Array<{ status?: string; code?: string; title?: string; detail?: string }>
}

interface AppResource {
  id: string
  attributes: { name: string; bundleId: string; sku?: string; primaryLocale?: string }
}

interface AppsResponse {
  data: AppResource[]
  links?: { next?: string }
}

const APP_FIELDS = 'fields[apps]=name,bundleId,sku,primaryLocale'

function toRemoteApp(item: AppResource): RemoteApp {
  return {
    id: item.id,
    name: item.attributes.name,
    bundleId: item.attributes.bundleId,
    sku: item.attributes.sku ?? null,
    primaryLocale: item.attributes.primaryLocale ?? null,
  }
}

export function createAppStoreClient(creds: AppStoreCredentials, fetchImpl: typeof fetch = fetch) {
  let cached: { token: string; expiresAt: number } | undefined

  function token() {
    const now = Date.now()
    if (!cached || cached.expiresAt - 60_000 < now) {
      try {
        cached = { token: createAppStoreToken(creds, now), expiresAt: now + TOKEN_TTL_SECONDS * 1000 }
      } catch (e) {
        throw new AppStoreError(`Private key could not be read: ${(e as Error).message}`)
      }
    }
    return cached.token
  }

  async function request<T>(path: string): Promise<T> {
    const res = await fetchImpl(`${BASE_URL}${path}`, { headers: { authorization: `Bearer ${token()}` } })
    if (res.ok) return res.json() as Promise<T>
    let detail = `App Store Connect responded ${res.status}`
    try {
      const body = (await res.json()) as AppleErrorBody
      const err = body.errors?.[0]
      if (err) detail = err.detail ?? err.title ?? detail
    } catch {}
    throw new AppStoreError(detail, res.status)
  }

  return {
    /** All apps visible to the key, following pagination. */
    async listApps(): Promise<RemoteApp[]> {
      const apps: RemoteApp[] = []
      let path: string | undefined = `/v1/apps?limit=200&${APP_FIELDS}`
      while (path) {
        const page: AppsResponse = await request<AppsResponse>(path)
        apps.push(...page.data.map(toRemoteApp))
        path = page.links?.next?.replace(BASE_URL, '')
      }
      return apps
    },

    async getApp(appId: string): Promise<RemoteApp> {
      const res = await request<{ data: AppResource }>(`/v1/apps/${encodeURIComponent(appId)}?${APP_FIELDS}`)
      return toRemoteApp(res.data)
    },
  }
}

export type AppStoreClient = ReturnType<typeof createAppStoreClient>
