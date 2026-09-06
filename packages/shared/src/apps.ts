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
