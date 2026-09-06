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
