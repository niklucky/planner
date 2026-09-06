import { Button, Dialog, Inline, Main, Text } from '@planner/frontend'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { useTRPC } from '../../lib/trpc'

const searchSchema = z.object({ token: z.string().default('') })

/** Target of the emailed invitation link: a modal over the app. */
export const Route = createFileRoute('/_app/invite')({
  validateSearch: (search) => searchSchema.parse(search),
  component: InvitePage,
})

function InvitePage() {
  const { token } = Route.useSearch()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const close = () => navigate({ to: '/' })
  const preview = useQuery(trpc.projects.previewInvite.queryOptions({ token }, { enabled: token.length > 0, retry: false }))
  const accept = useMutation(
    trpc.projects.acceptInvite.mutationOptions({
      onSuccess: async (project) => {
        await queryClient.invalidateQueries(trpc.projects.pathFilter())
        navigate({ to: '/projects/$projectId', params: { projectId: project.id } })
      },
    }),
  )

  return (
    <Main>
      <Dialog open title="Invitation" onClose={close}>
        {!token || preview.error ? (
          <Text>{preview.error?.message ?? 'This link is missing its invitation token.'}</Text>
        ) : preview.data ? (
          <>
            <Text>
              You've been invited to join <strong>{preview.data.projectName}</strong> as {preview.data.email}.
            </Text>
            {accept.error && <Text>{accept.error.message}</Text>}
          </>
        ) : (
          <Text>Loading…</Text>
        )}
        <Inline>
          {preview.data && !preview.error && (
            <Button variant="primary" size="lg" onClick={() => accept.mutate({ token })} disabled={accept.isPending}>
              {accept.isPending ? 'Joining…' : 'Join project'}
            </Button>
          )}
          <Button size="lg" onClick={close}>
            {preview.data ? 'Not now' : 'Close'}
          </Button>
        </Inline>
      </Dialog>
    </Main>
  )
}
