import { Button, Dialog, Inline, Row, Stack, Text } from '@planner/frontend'
import {
  type Platform,
  type ScreenshotSlotPlan,
  formatDeviceType,
  formatStoreState,
  screenshotsPerSetLimit,
} from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '../lib/trpc'

interface Props {
  projectId: string
  releaseId: string
  platform: Platform
  onClose: () => void
}

const STORE = { ios: 'App Store', android: 'Google Play' } as const

function describeSlot(platform: Platform, s: ScreenshotSlotPlan) {
  const parts = []
  if (s.createSet) parts.push('new set')
  if (platform === 'android' && (s.uploads || s.deletes)) parts.push(`replace ${s.deletes} with ${s.uploads}`)
  else {
    if (s.uploads) parts.push(`upload ${s.uploads}`)
    if (s.deletes) parts.push(`delete ${s.deletes}`)
  }
  if (s.reorder && !s.uploads && !s.deletes) parts.push('reorder')
  if (s.overLimit) parts.push(`over the ${screenshotsPerSetLimit(platform)} limit`)
  return `${s.locale} · ${formatDeviceType(platform, s.deviceType)}: ${parts.join(', ')}`
}

/** Fetches what a push would do, then pushes on confirm. */
export function PushScreenshotsDialog({ projectId, releaseId, platform, onClose }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const input = { projectId, releaseId }
  const planProc = platform === 'ios' ? trpc.screenshots.planAppStorePush : trpc.screenshots.planGooglePlayPush
  const pushProc = platform === 'ios' ? trpc.screenshots.pushToAppStore : trpc.screenshots.pushToGooglePlay
  const plan = useQuery(planProc.queryOptions(input, { staleTime: 0, gcTime: 0 }))
  const push = useMutation(
    pushProc.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.screenshots.pathFilter()),
    }),
  )

  const changes = plan.data?.reduce((n, v) => n + (v.editable ? v.slots.length : 0), 0) ?? 0
  const blocked = plan.data?.some((v) => v.slots.some((s) => s.overLimit)) ?? false
  const results = push.data

  return (
    <Dialog open title={`Push screenshots to ${STORE[platform]}`} onClose={onClose}>
      <Stack>
        {plan.isPending && <Text>Comparing with {STORE[platform]}…</Text>}
        {plan.error && <Text>{plan.error.message}</Text>}
        {(results ?? plan.data)?.map((v) => {
          const result = results?.find((r) => r.appVersionId === v.appVersionId)
          return (
            <Stack key={v.appVersionId}>
              <Row secondary={formatStoreState(v.state)}>
                {v.appName} {v.versionString === 'listing' ? '' : v.versionString}
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
                v.slots.map((s) => <Text key={`${s.locale}/${s.deviceType}`}>{describeSlot(platform, s)}</Text>)
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
