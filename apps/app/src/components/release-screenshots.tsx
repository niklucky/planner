import {
  Button,
  Gallery,
  GalleryEmpty,
  Inline,
  moveItem,
  Row,
  Select,
  Stack,
  Text,
  Thumbnail,
  useDragReorder,
} from '@planner/frontend'
import { DEVICE_TYPES, formatDeviceType, type Platform, type Screenshot } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { useTRPC } from '../lib/trpc'
import { uploadScreenshots } from '../lib/upload'
import { PushScreenshotsDialog } from './push-screenshots-dialog'

interface Props {
  projectId: string
  releaseId: string
  /** Platforms that have a store version in this release. */
  platforms: Platform[]
  /** Locales known from release notes, to offer before any screenshot exists. */
  locales: string[]
}

export function ReleaseScreenshots({ projectId, releaseId, platforms, locales }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const input = { projectId, releaseId }
  const { data: shots = [], error } = useQuery(trpc.screenshots.list.queryOptions(input))
  const invalidate = () => queryClient.invalidateQueries(trpc.screenshots.list.queryFilter(input))

  const pull = useMutation(trpc.screenshots.pullFromAppStore.mutationOptions({ onSuccess: invalidate }))
  const pullPlay = useMutation(trpc.screenshots.pullFromGooglePlay.mutationOptions({ onSuccess: invalidate }))
  const remove = useMutation(trpc.screenshots.remove.mutationOptions({ onSuccess: invalidate }))
  const reorder = useMutation(
    trpc.screenshots.reorder.mutationOptions({
      // Optimistic: reflect the new order immediately, then reconcile with the server.
      onMutate: async (vars) => {
        const key = trpc.screenshots.list.queryKey(input)
        await queryClient.cancelQueries({ queryKey: key })
        const previous = queryClient.getQueryData(key)
        queryClient.setQueryData(key, (old) =>
          old?.map((s) => {
            const i = vars.ids.indexOf(s.id)
            return i === -1 ? s : { ...s, position: i }
          }),
        )
        return { previous }
      },
      onError: (_e, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(trpc.screenshots.list.queryKey(input), ctx.previous)
      },
      onSettled: invalidate,
    }),
  )
  const upload = useMutation({
    mutationFn: (args: { slot: Parameters<typeof uploadScreenshots>[2]; files: FileList }) =>
      uploadScreenshots(projectId, releaseId, args.slot, args.files),
    onSuccess: invalidate,
  })

  const allLocales = useMemo(
    () => Array.from(new Set([...locales, ...shots.map((s) => s.locale)])).sort(),
    [locales, shots],
  )
  const [locale, setLocale] = useState<string>('')
  const currentLocale = allLocales.includes(locale) ? locale : (allLocales[0] ?? '')
  const [newDevice, setNewDevice] = useState<Record<Platform, string>>({ ios: '', android: '' })
  const [pushing, setPushing] = useState<Platform | null>(null)

  const busy = pull.isPending || pullPlay.isPending || remove.isPending || upload.isPending
  const message =
    pull.error?.message ??
    pullPlay.error?.message ??
    remove.error?.message ??
    upload.error?.message ??
    reorder.error?.message ??
    error?.message
  const imported = pull.data?.imported ?? pullPlay.data?.imported

  return (
    <Stack>
      <Inline>
        <Select value={currentLocale} onChange={(e) => setLocale(e.target.value)} disabled={allLocales.length === 0}>
          {allLocales.length === 0 && <option value="">No locales</option>}
          {allLocales.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        {platforms.includes('ios') && (
          <>
            <Button type="button" onClick={() => pull.mutate(input)} disabled={busy}>
              {pull.isPending ? 'Pulling…' : 'Pull from App Store'}
            </Button>
            <Button type="button" onClick={() => setPushing('ios')} disabled={busy}>
              Push to App Store…
            </Button>
          </>
        )}
        {platforms.includes('android') && (
          <>
            <Button type="button" onClick={() => pullPlay.mutate(input)} disabled={busy}>
              {pullPlay.isPending ? 'Pulling…' : 'Pull from Google Play'}
            </Button>
            <Button type="button" onClick={() => setPushing('android')} disabled={busy}>
              Push to Google Play…
            </Button>
          </>
        )}
      </Inline>
      {pushing && (
        <PushScreenshotsDialog
          projectId={projectId}
          releaseId={releaseId}
          platform={pushing}
          onClose={() => setPushing(null)}
        />
      )}
      {imported !== undefined && <Text>Imported {imported} screenshots.</Text>}
      {message && <Text>{message}</Text>}

      {platforms.map((platform) => {
        const forPlatform = shots.filter((s) => s.platform === platform && s.locale === currentLocale)
        const deviceTypes = Array.from(new Set(forPlatform.map((s) => s.deviceType)))
        const unused = DEVICE_TYPES[platform].filter((d) => !deviceTypes.includes(d.id))
        return (
          <Stack key={platform}>
            {platforms.length > 1 && <Text>{platform === 'ios' ? 'iOS' : 'Android'}</Text>}
            {deviceTypes.map((deviceType) => (
              <DeviceSlot
                key={deviceType}
                title={formatDeviceType(platform, deviceType)}
                shots={forPlatform.filter((s) => s.deviceType === deviceType).sort((a, b) => a.position - b.position)}
                projectId={projectId}
                disabled={busy}
                onUpload={(files) => upload.mutate({ slot: { platform, locale: currentLocale, deviceType }, files })}
                onRemove={(id) => remove.mutate({ projectId, screenshotId: id })}
                onReorder={(ids) => reorder.mutate({ ...input, platform, locale: currentLocale, deviceType, ids })}
              />
            ))}
            {currentLocale && unused.length > 0 && (
              <Inline>
                <Select
                  value={newDevice[platform]}
                  onChange={(e) => setNewDevice((d) => ({ ...d, [platform]: e.target.value }))}
                >
                  <option value="">Add device…</option>
                  {unused.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </Select>
                {newDevice[platform] && (
                  <UploadButton
                    disabled={busy}
                    onFiles={(files) => {
                      upload.mutate({
                        slot: { platform, locale: currentLocale, deviceType: newDevice[platform] },
                        files,
                      })
                      setNewDevice((d) => ({ ...d, [platform]: '' }))
                    }}
                  />
                )}
              </Inline>
            )}
          </Stack>
        )
      })}
    </Stack>
  )
}

function DeviceSlot({
  title,
  shots,
  projectId,
  disabled,
  onUpload,
  onRemove,
  onReorder,
}: {
  title: string
  shots: Screenshot[]
  projectId: string
  disabled: boolean
  onUpload: (files: FileList) => void
  onRemove: (id: string) => void
  onReorder: (ids: string[]) => void
}) {
  const drag = useDragReorder((from, to) => onReorder(moveItem(shots, from, to).map((s) => s.id)))
  return (
    <Stack>
      <Row secondary={<UploadButton disabled={disabled} onFiles={onUpload} />}>
        {title} · {shots.length}
      </Row>
      <Gallery>
        {shots.length === 0 && <GalleryEmpty>Empty</GalleryEmpty>}
        {shots.map((s, index) => (
          <Thumbnail
            key={s.id}
            src={`${s.url}?project=${projectId}`}
            alt={`${title} ${index + 1}`}
            onRemove={() => onRemove(s.id)}
            {...drag.itemProps(index)}
          />
        ))}
      </Gallery>
    </Stack>
  )
}

function UploadButton({ disabled, onFiles }: { disabled: boolean; onFiles: (files: FileList) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <Button type="button" onClick={() => ref.current?.click()} disabled={disabled}>
        Upload
      </Button>
    </>
  )
}
