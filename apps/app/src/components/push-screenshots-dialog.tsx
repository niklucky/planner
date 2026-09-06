import { Button, Dialog, Inline, Row, Stack, Text } from '@planner/frontend'
import { type ScreenshotSlotPlan, formatDeviceType, formatStoreState } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '../lib/trpc'

interface Props {
  projectId: string
  releaseId: string
  onClose: () => void
}

function describeSlot(s: ScreenshotSlotPlan) {
  const parts = []
  if (s.createSet) parts.push('new set')
  if (s.uploads) parts.push(`upload ${s.uploads}`)
  if (s.deletes) parts.push(`delete ${s.deletes}`)
  if (s.reorder && !s.uploads && !s.deletes) parts.push('reorder')
  if (s.overLimit) parts.push('over the 10 limit')
  return `${s.locale} · ${formatDeviceType('ios', s.deviceType)}: ${parts.join(', ')}`
}

/** Fetches what a push would do, then pushes on confirm. */
export function PushScreenshotsDialog({ projectId, releaseId, onClose }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const input = { projectId, releaseId }
  const plan = useQuery(trpc.screenshots.planAppStorePush.queryOptions(input, { staleTime: 0, gcTime: 0 }))
  const push = useMutation(
    trpc.screenshots.pushToAppStore.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.screenshots.pathFilter()),
    }),
  )

  const changes = plan.data?.reduce((n, v) => n + (v.editable ? v.slots.length : 0), 0) ?? 0
  const blocked = plan.data?.some((v) => v.slots.some((s) => s.overLimit)) ?? false
  const results = push.data

  return (
    <Dialog open title="Push screenshots to App Store" onClose={onClose}>
      <Stack>
        {plan.isPending && <Text>Comparing with App Store Connect…</Text>}
        {plan.error && <Text>{plan.error.message}</Text>}
        {(results ?? plan.data)?.map((v) => {
          const result = results?.find((r) => r.appVersionId === v.appVersionId)
          return (
            <Stack key={v.appVersionId}>
              <Row secondary={formatStoreState(v.state)}>
                {v.appName} {v.versionString}
              </Row>
              {result ? (
                <Text>
                  {result.error
                    ? `Failed at ${result.error}`
                    : `Uploaded ${result.uploaded}, deleted ${result.deleted}.`}
                </Text>
              ) : !v.editable ? (
                <Text>Not editable in this state.</Text>
              ) : v.slots.length === 0 ? (
                <Text>Already matches the store.</Text>
              ) : (
                v.slots.map((s) => <Text key={`${s.locale}/${s.deviceType}`}>{describeSlot(s)}</Text>)
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
                disabled={changes === 0 || blocked || push.isPending}
                onClick={() => push.mutate(input)}
              >
                {push.isPending ? 'Pushing…' : `Push ${changes} ${changes === 1 ? 'change' : 'changes'}`}
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
