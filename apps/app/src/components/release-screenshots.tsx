import { Button, Gallery, GalleryEmpty, Inline, Row, Select, Stack, Text, Thumbnail } from '@planner/frontend'
import { DEVICE_TYPES, type Platform, type Screenshot, formatDeviceType } from '@planner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { useTRPC } from '../lib/trpc'
import { uploadScreenshots } from '../lib/upload'

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
  const remove = useMutation(trpc.screenshots.remove.mutationOptions({ onSuccess: invalidate }))
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

  const busy = pull.isPending || remove.isPending || upload.isPending
  const message = pull.error?.message ?? remove.error?.message ?? upload.error?.message ?? error?.message

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
          <Button type="button" onClick={() => pull.mutate(input)} disabled={busy}>
            {pull.isPending ? 'Pulling…' : 'Pull from App Store'}
          </Button>
        )}
      </Inline>
      {pull.data && <Text>Imported {pull.data.imported} screenshots.</Text>}
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
                      upload.mutate({ slot: { platform, locale: currentLocale, deviceType: newDevice[platform] }, files })
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
}: {
  title: string
  shots: Screenshot[]
  projectId: string
  disabled: boolean
  onUpload: (files: FileList) => void
  onRemove: (id: string) => void
}) {
  return (
    <Stack>
      <Row secondary={<UploadButton disabled={disabled} onFiles={onUpload} />}>
        {title} · {shots.length}
      </Row>
      <Gallery>
        {shots.length === 0 && <GalleryEmpty>Empty</GalleryEmpty>}
        {shots.map((s) => (
          <Thumbnail
            key={s.id}
            src={`${s.url}?project=${projectId}`}
            alt={`${title} ${s.position + 1}`}
            onRemove={() => onRemove(s.id)}
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
