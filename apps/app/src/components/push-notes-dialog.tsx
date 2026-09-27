import { Button, Dialog, Inline, Row, Stack, Text } from '@planner/frontend'
import { formatStoreState, type PushPlanVersion } from '@planner/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '../lib/trpc'

interface Props {
  projectId: string
  releaseId: string
  plan: PushPlanVersion[]
  onClose: () => void
}

/** Shows what a push would change per App Store version, then pushes on confirm. */
export function PushNotesDialog({ projectId, releaseId, plan, onClose }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const push = useMutation(
    trpc.releases.pushNotes.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.releases.pathFilter()),
    }),
  )

  const changeCount = plan.reduce((n, p) => n + (p.editable ? p.changes.length : 0), 0)
  const results = push.data

  return (
    <Dialog open title="Push to App Store" onClose={onClose}>
      <Stack>
        {plan.map((p) => {
          const result = results?.find((r) => r.appVersionId === p.appVersionId)
          return (
            <Stack key={p.appVersionId}>
              <Row secondary={formatStoreState(p.state)}>
                {p.appName} {p.versionString}
              </Row>
              {result ? (
                <Text>
                  {result.pushed.length > 0 && `Updated ${result.pushed.join(', ')}. `}
                  {result.pushed.length === 0 && !result.error && 'Nothing sent. '}
                  {result.error && `Failed: ${result.error}`}
                </Text>
              ) : !p.editable ? (
                <Text>Not editable in this state.</Text>
              ) : (
                <Text>
                  {p.changes.length > 0 && `Update ${p.changes.map((c) => c.locale).join(', ')}. `}
                  {p.unchanged.length > 0 && `${p.unchanged.length} unchanged. `}
                  {p.missingInStore.length > 0 && `Not in store: ${p.missingInStore.join(', ')}. `}
                  {p.changes.length === 0 &&
                    p.unchanged.length === 0 &&
                    p.missingInStore.length === 0 &&
                    'No notes to push.'}
                </Text>
              )}
            </Stack>
          )
        })}
        {push.error && <Text>{push.error.message}</Text>}
        <Inline>
          {results ? (
            <Button variant="primary" size="lg" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                size="lg"
                disabled={changeCount === 0 || push.isPending}
                onClick={() => push.mutate({ projectId, releaseId })}
              >
                {push.isPending ? 'Pushing…' : `Push ${changeCount} ${changeCount === 1 ? 'locale' : 'locales'}`}
              </Button>
              <Button size="lg" onClick={onClose}>
                Cancel
              </Button>
            </>
          )}
        </Inline>
      </Stack>
    </Dialog>
  )
}
