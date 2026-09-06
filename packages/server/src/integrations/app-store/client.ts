import type { AppStoreCredentials, RemoteApp, RemoteVersion } from '@planner/shared'
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
const VERSION_FIELDS = 'fields[appStoreVersions]=versionString,appVersionState,appStoreState,platform,releaseType,createdDate'

interface VersionResource {
  id: string
  attributes: {
    versionString: string
    appVersionState?: string
    /** Deprecated by Apple in favour of appVersionState; still returned. */
    appStoreState?: string
    platform: string
    releaseType?: string
    createdDate?: string
  }
}

interface LocalizationResource {
  id: string
  attributes: { locale: string; whatsNew?: string | null }
}

export interface RemoteLocalization {
  id: string
  locale: string
  whatsNew: string | null
}

function toRemoteVersion(item: VersionResource): RemoteVersion {
  const a = item.attributes
  return {
    id: item.id,
    versionString: a.versionString,
    platform: a.platform,
    state: a.appVersionState ?? a.appStoreState ?? 'UNKNOWN',
    releaseType: a.releaseType ?? null,
    createdAt: a.createdDate ? new Date(a.createdDate) : null,
  }
}

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

    /** All App Store versions of an app, newest first. */
    async listVersions(appId: string): Promise<RemoteVersion[]> {
      const versions: RemoteVersion[] = []
      let path: string | undefined = `/v1/apps/${encodeURIComponent(appId)}/appStoreVersions?limit=50&${VERSION_FIELDS}`
      while (path) {
        const page: { data: VersionResource[]; links?: { next?: string } } = await request(path)
        versions.push(...page.data.map(toRemoteVersion))
        path = page.links?.next?.replace(BASE_URL, '')
      }
      return versions.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    },

    /** Per-locale metadata of a version. */
    async listVersionLocalizations(versionId: string): Promise<RemoteLocalization[]> {
      const out: RemoteLocalization[] = []
      let path: string | undefined =
        `/v1/appStoreVersions/${encodeURIComponent(versionId)}/appStoreVersionLocalizations?limit=50&fields[appStoreVersionLocalizations]=locale,whatsNew`
      while (path) {
        const page: { data: LocalizationResource[]; links?: { next?: string } } = await request(path)
        out.push(...page.data.map((l) => ({ id: l.id, locale: l.attributes.locale, whatsNew: l.attributes.whatsNew ?? null })))
        path = page.links?.next?.replace(BASE_URL, '')
      }
      return out
    },

    async getApp(appId: string): Promise<RemoteApp> {
      const res = await request<{ data: AppResource }>(`/v1/apps/${encodeURIComponent(appId)}?${APP_FIELDS}`)
      return toRemoteApp(res.data)
    },
  }
}

export type AppStoreClient = ReturnType<typeof createAppStoreClient>
