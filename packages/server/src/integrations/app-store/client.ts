import type { AppStoreCredentials, RemoteApp, RemoteVersion } from '@planner/shared'
import { createAppStoreToken, TOKEN_TTL_SECONDS } from './token'

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
const VERSION_FIELDS =
  'fields[appStoreVersions]=versionString,appVersionState,appStoreState,platform,releaseType,createdDate'

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

export interface RemoteScreenshot {
  id: string
  fileName: string
  width: number | null
  height: number | null
  /** Full-size download URL, or null while Apple is still processing the upload. */
  url: string | null
}

export interface RemoteScreenshotSet {
  id: string
  displayType: string
  screenshots: RemoteScreenshot[]
}

interface ScreenshotSetResource {
  id: string
  attributes: { screenshotDisplayType: string }
  relationships?: { appScreenshots?: { data?: Array<{ id: string }> } }
}

interface ScreenshotResource {
  type: string
  id: string
  attributes: {
    fileName?: string
    imageAsset?: { templateUrl?: string; width?: number; height?: number } | null
  }
}

export interface UploadOperation {
  method: string
  url: string
  length: number
  offset: number
  requestHeaders?: Array<{ name: string; value: string }>
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

  async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await fetchImpl(`${BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token()}`,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
    if (res.status === 204) return undefined as T
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
        out.push(
          ...page.data.map((l) => ({ id: l.id, locale: l.attributes.locale, whatsNew: l.attributes.whatsNew ?? null })),
        )
        path = page.links?.next?.replace(BASE_URL, '')
      }
      return out
    },

    /** Screenshot sets of a version localization, one per device class, in display order. */
    async listScreenshotSets(localizationId: string): Promise<RemoteScreenshotSet[]> {
      const path =
        `/v1/appStoreVersionLocalizations/${encodeURIComponent(localizationId)}/appScreenshotSets` +
        '?include=appScreenshots&limit=50&limit[appScreenshots]=50' +
        '&fields[appScreenshotSets]=screenshotDisplayType,appScreenshots&fields[appScreenshots]=fileName,imageAsset'
      const res = await request<{ data: ScreenshotSetResource[]; included?: ScreenshotResource[] }>(path)
      const byId = new Map((res.included ?? []).filter((i) => i.type === 'appScreenshots').map((i) => [i.id, i]))
      return res.data.map((set) => ({
        id: set.id,
        displayType: set.attributes.screenshotDisplayType,
        screenshots: (set.relationships?.appScreenshots?.data ?? []).flatMap(({ id }) => {
          const shot = byId.get(id)
          if (!shot) return []
          const asset = shot.attributes.imageAsset
          const url =
            asset?.templateUrl && asset.width && asset.height
              ? asset.templateUrl
                  .replace('{w}', String(asset.width))
                  .replace('{h}', String(asset.height))
                  .replace('{f}', 'png')
              : null
          return [
            {
              id,
              fileName: shot.attributes.fileName ?? id,
              width: asset?.width ?? null,
              height: asset?.height ?? null,
              url,
            },
          ]
        }),
      }))
    },

    async createScreenshotSet(localizationId: string, displayType: string): Promise<{ id: string }> {
      const res = await request<{ data: { id: string } }>('/v1/appScreenshotSets', {
        method: 'POST',
        body: {
          data: {
            type: 'appScreenshotSets',
            attributes: { screenshotDisplayType: displayType },
            relationships: {
              appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: localizationId } },
            },
          },
        },
      })
      return { id: res.data.id }
    },

    /** Step 1 of an upload: reserve the screenshot and get upload instructions. */
    async createScreenshot(setId: string, fileName: string, fileSize: number) {
      const res = await request<{ data: { id: string; attributes: { uploadOperations?: UploadOperation[] } } }>(
        '/v1/appScreenshots',
        {
          method: 'POST',
          body: {
            data: {
              type: 'appScreenshots',
              attributes: { fileName, fileSize },
              relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } },
            },
          },
        },
      )
      return { id: res.data.id, uploadOperations: res.data.attributes.uploadOperations ?? [] }
    },

    /** Step 2: send the bytes to Apple's upload endpoints, one chunk per operation. */
    async performUploadOperations(operations: UploadOperation[], bytes: Uint8Array) {
      for (const op of operations) {
        const chunk = bytes.subarray(op.offset, op.offset + op.length)
        const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]))
        const res = await fetchImpl(op.url, {
          method: op.method,
          headers,
          body: chunk as unknown as RequestInit['body'],
        })
        if (!res.ok) throw new AppStoreError(`Upload chunk failed (${res.status})`, res.status)
      }
    },

    /** Step 3: tell Apple the upload is complete. */
    async commitScreenshot(screenshotId: string, md5Hex: string) {
      await request(`/v1/appScreenshots/${encodeURIComponent(screenshotId)}`, {
        method: 'PATCH',
        body: {
          data: {
            type: 'appScreenshots',
            id: screenshotId,
            attributes: { uploaded: true, sourceFileChecksum: md5Hex },
          },
        },
      })
    },

    async deleteScreenshot(screenshotId: string) {
      await request(`/v1/appScreenshots/${encodeURIComponent(screenshotId)}`, { method: 'DELETE' })
    },

    /** Sets the display order of a set's screenshots. */
    async reorderScreenshotSet(setId: string, screenshotIds: string[]) {
      await request(`/v1/appScreenshotSets/${encodeURIComponent(setId)}/relationships/appScreenshots`, {
        method: 'PATCH',
        body: { data: screenshotIds.map((id) => ({ type: 'appScreenshots', id })) },
      })
    },

    /** Updates metadata of one version localization (e.g. what's new). */
    async updateVersionLocalization(localizationId: string, attributes: { whatsNew: string }) {
      await request(`/v1/appStoreVersionLocalizations/${encodeURIComponent(localizationId)}`, {
        method: 'PATCH',
        body: { data: { type: 'appStoreVersionLocalizations', id: localizationId, attributes } },
      })
    },

    async getApp(appId: string): Promise<RemoteApp> {
      const res = await request<{ data: AppResource }>(`/v1/apps/${encodeURIComponent(appId)}?${APP_FIELDS}`)
      return toRemoteApp(res.data)
    },
  }
}

export type AppStoreClient = ReturnType<typeof createAppStoreClient>
