import { z } from 'zod'
import { platformSchema } from './apps'

/** Store device classes we can upload to, keyed by the store's own identifier. */
export const DEVICE_TYPES: Record<'ios' | 'android', Array<{ id: string; label: string }>> = {
  ios: [
    { id: 'APP_IPHONE_67', label: 'iPhone 6.7"' },
    { id: 'APP_IPHONE_65', label: 'iPhone 6.5"' },
    { id: 'APP_IPHONE_61', label: 'iPhone 6.1"' },
    { id: 'APP_IPHONE_58', label: 'iPhone 5.8"' },
    { id: 'APP_IPHONE_55', label: 'iPhone 5.5"' },
    { id: 'APP_IPAD_PRO_3GEN_129', label: 'iPad Pro 12.9" (3rd gen)' },
    { id: 'APP_IPAD_PRO_3GEN_11', label: 'iPad Pro 11"' },
    { id: 'APP_IPAD_PRO_129', label: 'iPad Pro 12.9" (2nd gen)' },
    { id: 'APP_IPAD_105', label: 'iPad 10.5"' },
    { id: 'APP_IPAD_97', label: 'iPad 9.7"' },
    { id: 'APP_APPLE_VISION_PRO', label: 'Apple Vision Pro' },
    { id: 'APP_WATCH_ULTRA', label: 'Apple Watch Ultra' },
    { id: 'APP_APPLE_TV', label: 'Apple TV' },
    { id: 'APP_DESKTOP', label: 'Mac' },
  ],
  android: [
    { id: 'phoneScreenshots', label: 'Phone' },
    { id: 'sevenInchScreenshots', label: '7" tablet' },
    { id: 'tenInchScreenshots', label: '10" tablet' },
    { id: 'tvScreenshots', label: 'TV' },
    { id: 'wearScreenshots', label: 'Wear' },
  ],
}

export function formatDeviceType(platform: 'ios' | 'android', id: string) {
  return DEVICE_TYPES[platform].find((d) => d.id === id)?.label ?? id
}

export const SCREENSHOT_MAX_BYTES = 20 * 1024 * 1024
export const SCREENSHOT_CONTENT_TYPES = ['image/png', 'image/jpeg'] as const

export const screenshotSlotInput = z.object({
  platform: platformSchema,
  locale: z.string().trim().min(2).max(20),
  deviceType: z.string().trim().min(1).max(64),
})
export type ScreenshotSlot = z.infer<typeof screenshotSlotInput>

export const screenshotIdInput = z.object({ screenshotId: z.uuid() })

export interface Screenshot {
  id: string
  releaseId: string
  platform: 'ios' | 'android'
  locale: string
  deviceType: string
  position: number
  fileId: string
  /** URL path to fetch the image from our API. */
  url: string
  width: number | null
  height: number | null
  /** Set when the screenshot exists in the store (pulled or pushed). */
  storeExternalId: string | null
}

/** What pushing a release's screenshots would do for one slot. */
export interface ScreenshotSlotPlan {
  locale: string
  deviceType: string
  /** Store set to be created because none exists yet. */
  createSet: boolean
  uploads: number
  deletes: number
  reorder: boolean
  /** More screenshots than the store allows in one set. */
  overLimit: boolean
}

export interface ScreenshotPushPlanVersion {
  appVersionId: string
  appName: string
  versionString: string
  state: string
  editable: boolean
  slots: ScreenshotSlotPlan[]
}

export interface ScreenshotPushResultVersion extends ScreenshotPushPlanVersion {
  uploaded: number
  deleted: number
  error: string | null
}

/** Apple allows 10 screenshots per set, Google 8 per image type. */
export function screenshotsPerSetLimit(platform: 'ios' | 'android') {
  return platform === 'ios' ? 10 : 8
}

/** New order of a slot's screenshots: every id of the slot, exactly once. */
export const reorderScreenshotsInput = screenshotSlotInput.extend({
  releaseId: z.uuid(),
  ids: z.array(z.uuid()).min(1).max(50),
})
export type ReorderScreenshotsInput = z.infer<typeof reorderScreenshotsInput>
