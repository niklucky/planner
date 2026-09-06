import { Button, Dialog, Inline, Stack, Text } from '@planner/frontend'
import type { MyInvitation } from '@planner/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTRPC } from '../lib/trpc'

/** Pending invitations for the signed-in user. Shown on every load until each is joined or declined. */
export function InvitationsDialog({ invitations, onClose }: { invitations: MyInvitation[]; onClose: () => void }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const refresh = () => queryClient.invalidateQueries(trpc.projects.pathFilter())

  const accept = useMutation(
    trpc.projects.acceptMyInvitation.mutationOptions({
      onSuccess: async (project) => {
        await refresh()
        navigate({ to: '/projects/$projectId', params: { projectId: project.id } })
      },
    }),
  )
  const decline = useMutation(trpc.projects.declineMyInvitation.mutationOptions({ onSuccess: refresh }))
  const busy = accept.isPending || decline.isPending
  const error = accept.error ?? decline.error

  return (
    <Dialog open title={invitations.length === 1 ? 'Invitation' : 'Invitations'} onClose={onClose}>
      <Stack>
        {invitations.map((inv) => (
          <Stack key={inv.id}>
            <Text>
              <strong>{inv.projectName}</strong>
              {inv.inviterName ? ` · invited by ${inv.inviterName}` : ''}
            </Text>
            <Inline>
              <Button variant="primary" onClick={() => accept.mutate({ invitationId: inv.id })} disabled={busy}>
                Join
              </Button>
              <Button onClick={() => decline.mutate({ invitationId: inv.id })} disabled={busy}>
                Decline
              </Button>
            </Inline>
          </Stack>
        ))}
        {error && <Text>{error.message}</Text>}
        <Inline>
          <Button onClick={onClose}>Not now</Button>
        </Inline>
      </Stack>
    </Dialog>
  )
}
