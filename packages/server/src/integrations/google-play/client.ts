import type { RemoteVersion } from '@planner/shared'
import { type GoogleAccessToken, type GoogleServiceAccount, fetchGoogleAccessToken } from './auth'

const BASE_URL = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
const UPLOAD_URL = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications'

export class GooglePlayError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'GooglePlayError'
  }
}

export interface PlayLocalizedText {
  language: string
  text: string
}

export interface PlayRelease {
  name?: string
  status?: string
  versionCodes?: string[]
  releaseNotes?: PlayLocalizedText[]
}

export interface PlayTrack {
  track: string
  releases?: PlayRelease[]
}

export interface PlayImage {
  id: string
  url: string
  sha256?: string
}

export interface PlayAppInfo {
  packageName: string
  title: string
  defaultLanguage: string | null
}

/** A release's identity within a track: Google has no id, so we use track + release name. */
export function releaseName(r: PlayRelease) {
  return r.name ?? (r.versionCodes ?? []).join(',')
}

export function toRemoteVersion(track: string, r: PlayRelease): RemoteVersion {
  const name = releaseName(r)
  return {
    id: `${track}/${name}`,
    versionString: name,
    platform: track,
    state: (r.status ?? 'unknown').replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(),
    releaseType: null,
    createdAt: null,
  }
}

export function createGooglePlayClient(sa: GoogleServiceAccount, fetchImpl: typeof fetch = fetch) {
  let cached: GoogleAccessToken | undefined

  async function token() {
    if (!cached || cached.expiresAt - 60_000 < Date.now()) {
      try {
        cached = await fetchGoogleAccessToken(sa, undefined, fetchImpl)
      } catch (e) {
        throw new GooglePlayError((e as Error).message)
      }
    }
    return cached.accessToken
  }

  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown; raw?: { bytes: Uint8Array; contentType: string }; absolute?: boolean } = {},
  ): Promise<T> {
    const url = init.absolute ? path : `${BASE_URL}${path}`
    const res = await fetchImpl(url, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${await token()}`,
        ...(init.raw ? { 'content-type': init.raw.contentType } : init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.raw ? (init.raw.bytes as unknown as RequestInit['body']) : init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
    if (res.status === 204) return undefined as T
    const text = await res.text()
    if (res.ok) return (text ? JSON.parse(text) : undefined) as T
    let detail = `Google Play responded ${res.status}`
    try {
      const body = JSON.parse(text) as { error?: { message?: string } }
      if (body.error?.message) detail = body.error.message
    } catch {}
    throw new GooglePlayError(detail, res.status)
  }

  /** Every read and write goes through a short-lived edit. Uncommitted edits are deleted. */
  async function withEdit<T>(packageName: string, fn: (editId: string) => Promise<T>, commit = false): Promise<T> {
    const pkg = encodeURIComponent(packageName)
    const edit = await request<{ id: string }>(`/${pkg}/edits`, { method: 'POST', body: {} })
    try {
      const result = await fn(edit.id)
      if (commit) {
        try {
          await request(`/${pkg}/edits/${edit.id}:commit`, { method: 'POST' })
        } catch (e) {
          // Google requires this flag when the app has other changes pending review.
          if (e instanceof GooglePlayError && /changesNotSentForReview/i.test(e.message)) {
            await request(`/${pkg}/edits/${edit.id}:commit?changesNotSentForReview=true`, { method: 'POST' })
          } else throw e
        }
      }
      return result
    } finally {
      if (!commit) await request(`/${pkg}/edits/${edit.id}`, { method: 'DELETE' }).catch(() => {})
    }
  }

  return {
    /** Validates the key by obtaining an access token. */
    async verify() {
      await token()
    },

    async getAppInfo(packageName: string): Promise<PlayAppInfo> {
      return withEdit(packageName, async (editId) => {
        const pkg = encodeURIComponent(packageName)
        const details = await request<{ defaultLanguage?: string }>(`/${pkg}/edits/${editId}/details`)
        const listings = await request<{ listings?: Array<{ language: string; title?: string }> }>(
          `/${pkg}/edits/${editId}/listings`,
        )
        const all = listings.listings ?? []
        const preferred = all.find((l) => l.language === details.defaultLanguage) ?? all[0]
        return { packageName, title: preferred?.title ?? packageName, defaultLanguage: details.defaultLanguage ?? null }
      })
    },

    async listTracks(packageName: string): Promise<PlayTrack[]> {
      return withEdit(packageName, async (editId) => {
        const res = await request<{ tracks?: PlayTrack[] }>(`/${encodeURIComponent(packageName)}/edits/${editId}/tracks`)
        return res.tracks ?? []
      })
    },

    /** All releases across tracks as store versions. */
    async listVersions(packageName: string): Promise<RemoteVersion[]> {
      const tracks = await this.listTracks(packageName)
      return tracks.flatMap((t) => (t.releases ?? []).map((r) => toRemoteVersion(t.track, r)))
    },

    /** Release notes of one release, keyed by language. */
    async getReleaseNotes(packageName: string, track: string, name: string): Promise<PlayLocalizedText[]> {
      const tracks = await this.listTracks(packageName)
      const release = tracks.find((t) => t.track === track)?.releases?.find((r) => releaseName(r) === name)
      if (!release) throw new GooglePlayError(`Release ${name} not found on track ${track}`)
      return release.releaseNotes ?? []
    },

    /** Languages that have a store listing. */
    async listListingLanguages(packageName: string): Promise<string[]> {
      return withEdit(packageName, async (editId) => {
        const res = await request<{ listings?: Array<{ language: string }> }>(
          `/${encodeURIComponent(packageName)}/edits/${editId}/listings`,
        )
        return (res.listings ?? []).map((l) => l.language)
      })
    },

    /** Listing images per language and image type, in display order. */
    async listImages(packageName: string, languages: string[], imageTypes: string[]) {
      return withEdit(packageName, async (editId) => {
        const pkg = encodeURIComponent(packageName)
        const out: Array<{ language: string; imageType: string; images: PlayImage[] }> = []
        for (const language of languages) {
          for (const imageType of imageTypes) {
            const res = await request<{ images?: PlayImage[] }>(
              `/${pkg}/edits/${editId}/listings/${encodeURIComponent(language)}/${imageType}`,
            )
            out.push({ language, imageType, images: res.images ?? [] })
          }
        }
        return out
      })
    },

    /**
     * Replaces the images of the given slots (Google has no reorder, so each slot
     * is cleared and re-uploaded in order) in one committed edit. Returns new ids.
     */
    async replaceImages(
      packageName: string,
      slots: Array<{ language: string; imageType: string; files: Array<{ bytes: Uint8Array; contentType: string }> }>,
    ) {
      const pkg = encodeURIComponent(packageName)
      return withEdit(
        packageName,
        async (editId) => {
          const results: Array<{ language: string; imageType: string; ids: string[] }> = []
          for (const slot of slots) {
            const base = `/${pkg}/edits/${editId}/listings/${encodeURIComponent(slot.language)}/${slot.imageType}`
            await request(base, { method: 'DELETE' })
            const ids: string[] = []
            for (const file of slot.files) {
              const res = await request<{ image?: PlayImage }>(`${UPLOAD_URL}${base}?uploadType=media`, {
                method: 'POST',
                raw: file,
                absolute: true,
              })
              if (!res.image?.id) throw new GooglePlayError('Upload returned no image id')
              ids.push(res.image.id)
            }
            results.push({ language: slot.language, imageType: slot.imageType, ids })
          }
          return results
        },
        true,
      )
    },

    /** Replaces the given languages' notes on one release, keeping other languages, and commits. */
    async updateReleaseNotes(packageName: string, track: string, name: string, notes: PlayLocalizedText[]) {
      const pkg = encodeURIComponent(packageName)
      await withEdit(
        packageName,
        async (editId) => {
          const current = await request<PlayTrack>(`/${pkg}/edits/${editId}/tracks/${encodeURIComponent(track)}`)
          const releases = current.releases ?? []
          const target = releases.find((r) => releaseName(r) === name)
          if (!target) throw new GooglePlayError(`Release ${name} not found on track ${track}`)
          const kept = (target.releaseNotes ?? []).filter((n) => !notes.some((u) => u.language === n.language))
          target.releaseNotes = [...kept, ...notes]
          await request(`/${pkg}/edits/${editId}/tracks/${encodeURIComponent(track)}`, {
            method: 'PUT',
            body: { track, releases },
          })
        },
        true,
      )
    },
  }
}

export type GooglePlayClient = ReturnType<typeof createGooglePlayClient>
