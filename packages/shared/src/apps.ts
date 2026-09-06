import { z } from 'zod'

export const PLATFORMS = ['ios', 'android'] as const
export const platformSchema = z.enum(PLATFORMS)
export type Platform = z.infer<typeof platformSchema>

export const createAppInput = z.object({
  name: z.string().min(1).max(120),
  platform: platformSchema,
  bundleId: z.string().min(1).max(255),
})
export type CreateAppInput = z.infer<typeof createAppInput>

/** Link a store app to the project (creates the app row from store data). */
export const importAppInput = z.object({
  integrationId: z.uuid(),
  /** The store's id for the app (Apple app id). */
  externalId: z.string().min(1),
})
export type ImportAppInput = z.infer<typeof importAppInput>

export const appIdInput = z.object({ appId: z.uuid() })

/** A version as reported by the store. */
export interface RemoteVersion {
  id: string
  versionString: string
  /** Store platform, e.g. IOS, MAC_OS, TV_OS, VISION_OS. */
  platform: string
  /** Store state, e.g. READY_FOR_DISTRIBUTION, WAITING_FOR_REVIEW. */
  state: string
  releaseType: string | null
  createdAt: Date | null
}

/** "READY_FOR_DISTRIBUTION" → "Ready for distribution". */
export function formatStoreState(state: string) {
  const words = state.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Store platform code → label. */
export function formatStorePlatform(platform: string) {
  return { IOS: 'iOS', MAC_OS: 'macOS', TV_OS: 'tvOS', VISION_OS: 'visionOS' }[platform] ?? platform
}
