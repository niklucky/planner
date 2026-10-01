import { z } from 'zod'

/** Where a project's published content is served. Each API key belongs to one. */
export interface Environment {
  id: string
  name: string
  /** The one environment the others fall back to; it can't be deleted. */
  isProduction: boolean
  createdAt: Date
}

const environmentName = z.string().trim().min(1, 'Enter a name').max(40)

export const createEnvironmentInput = z.object({ name: environmentName })
export const renameEnvironmentInput = z.object({ environmentId: z.uuid(), name: environmentName })
export const environmentIdInput = z.object({ environmentId: z.uuid() })

/** Production first, then the rest in the order they were added. */
export function sortEnvironments<T extends { isProduction: boolean; createdAt: Date }>(envs: T[]): T[] {
  return [...envs].sort(
    (a, b) => Number(b.isProduction) - Number(a.isProduction) || a.createdAt.getTime() - b.createdAt.getTime(),
  )
}
