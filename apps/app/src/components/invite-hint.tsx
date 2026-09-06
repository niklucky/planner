import { Text } from '@planner/frontend'
import { useQuery } from '@tanstack/react-query'
import { useTRPC } from '../lib/trpc'

/** Loads the invitation behind a token and exposes its email; renders the hint text. */
export function useInvitePreview(token: string | undefined) {
  const trpc = useTRPC()
  return useQuery(trpc.projects.previewInvite.queryOptions({ token: token ?? '' }, { enabled: !!token, retry: false }))
}

export function InviteHint({
  preview,
  email,
}: {
  preview: { projectName: string; email: string } | undefined
  /** Email currently in the form, to warn when it differs. */
  email: string
}) {
  if (!preview) return null
  if (email.trim().toLowerCase() === preview.email) {
    return <Text>You're invited to {preview.projectName}.</Text>
  }
  return (
    <Text>
      The invitation to {preview.projectName} was sent to {preview.email}. With a different email you won't be added to the
      project.
    </Text>
  )
}
