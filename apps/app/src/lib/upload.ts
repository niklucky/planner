import type { MediaFile, Screenshot, ScreenshotSlot } from '@planner/shared'

/** Uploads images to a release slot through the REST endpoint (multipart). */
export async function uploadScreenshots(
  projectId: string,
  releaseId: string,
  slot: ScreenshotSlot,
  files: FileList | File[],
): Promise<Screenshot[]> {
  const form = new FormData()
  form.set('platform', slot.platform)
  form.set('locale', slot.locale)
  form.set('deviceType', slot.deviceType)
  for (const file of Array.from(files)) form.append('files', file)
  const res = await fetch(`/api/projects/${projectId}/releases/${releaseId}/screenshots`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  })
  const body = (await res.json()) as Screenshot[] | { error: string }
  if (!res.ok) throw new Error('error' in body ? body.error : `Upload failed (${res.status})`)
  return body as Screenshot[]
}

/** Uploads an image or video for an onboarding page; the page refers to it by the returned id. */
export async function uploadOnboardingMedia(projectId: string, onboardingId: string, file: File): Promise<MediaFile> {
  const form = new FormData()
  form.set('file', file)
  const res = await fetch(`/api/projects/${projectId}/onboardings/${onboardingId}/media`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  })
  const body = (await res.json()) as MediaFile | { error: string }
  if (!res.ok) throw new Error('error' in body ? body.error : `Upload failed (${res.status})`)
  return body as MediaFile
}
