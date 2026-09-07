import { z } from 'zod'

export const INTEGRATION_PROVIDERS = ['app_store', 'google_play', 'translation'] as const
export const integrationProviderSchema = z.enum(INTEGRATION_PROVIDERS)
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>

export const INTEGRATION_STATUSES = ['connected', 'error'] as const
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number]

export const projectScopedInput = z.object({ projectId: z.uuid() })
export const integrationIdInput = z.object({ integrationId: z.uuid() })

/** Apple issuer IDs look like UUIDs but don't follow RFC 4122 version/variant bits. */
const ISSUER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** App Store Connect API key (Users and Access → Integrations → Team Keys). */
export const appStoreCredentialsInput = z.object({
  issuerId: z.string().trim().regex(ISSUER_ID_PATTERN, 'Issuer ID looks like 57246542-96fe-1a63-e053-0824d011072a'),
  keyId: z.string().trim().min(1, 'Enter the Key ID').max(32),
  privateKey: z
    .string()
    .trim()
    .refine((s) => s.includes('BEGIN PRIVATE KEY'), 'Paste the full contents of the .p8 file'),
})
export type AppStoreCredentials = z.infer<typeof appStoreCredentialsInput>

/** Integration as exposed to clients: never includes credentials. */
export interface Integration {
  id: string
  projectId: string
  provider: IntegrationProvider
  status: IntegrationStatus
  lastError: string | null
  lastVerifiedAt: Date | null
  /** Non-secret identifiers for display, e.g. { issuerId, keyId }. */
  metadata: Record<string, string>
  createdAt: Date
}

/** An app as listed by the store. */
export interface RemoteApp {
  id: string
  name: string
  bundleId: string
  sku: string | null
  primaryLocale: string | null
}

/** Google Cloud service account key (JSON) with access to the Play Console. */
export const googlePlayCredentialsInput = z.object({
  serviceAccountJson: z
    .string()
    .trim()
    .min(1, 'Paste the service account JSON')
    .superRefine((raw, ctx) => {
      try {
        const o = JSON.parse(raw) as Record<string, unknown>
        if (typeof o.client_email !== 'string' || typeof o.private_key !== 'string') {
          ctx.addIssue({ code: 'custom', message: 'JSON must contain client_email and private_key' })
        }
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Not valid JSON' })
      }
    }),
})
export type GooglePlayCredentialsInput = z.infer<typeof googlePlayCredentialsInput>

/** Google Play has no "list apps" API; apps are added by package name. */
export const importGooglePlayAppInput = z.object({
  integrationId: z.uuid(),
  packageName: z
    .string()
    .trim()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/, 'Package name looks like com.example.app'),
})
export type ImportGooglePlayAppInput = z.infer<typeof importGooglePlayAppInput>
