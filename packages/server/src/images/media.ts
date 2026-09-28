import { contentTypeFor, type ImageSize, imageSize } from './size'

export interface MediaInfo {
  contentType: string
  /** Pixel size, when the format carries it where we can read it. */
  size: ImageSize | null
}

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length))

/** WebP: RIFF container with a VP8 (lossy), VP8L (lossless) or VP8X (extended) chunk first. */
function webpSize(bytes: Uint8Array): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunk = ascii(bytes, 12, 4)
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
  }
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const bits = view.getUint32(21, true)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const u24 = (o: number) => bytes[o]! | (bytes[o + 1]! << 8) | (bytes[o + 2]! << 16)
    return { width: u24(24) + 1, height: u24(27) + 1 }
  }
  return null
}

/** MP4 / QuickTime: the first track header (`moov/trak/tkhd`) with a non-zero size, i.e. the video track. */
function mp4Size(bytes: Uint8Array): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const walk = (start: number, end: number, path: string[]): ImageSize | null => {
    let offset = start
    while (offset + 8 <= end) {
      let size = view.getUint32(offset)
      const type = ascii(bytes, offset + 4, 4)
      let header = 8
      if (size === 1) {
        if (offset + 16 > end) return null
        size = Number(view.getBigUint64(offset + 8))
        header = 16
      } else if (size === 0) size = end - offset
      if (size < header || offset + size > end) return null
      const body = offset + header
      if (path.length === 0 && type === 'moov') return walk(body, offset + size, ['moov'])
      if (path.length === 1 && type === 'trak') {
        const found = walk(body, offset + size, ['moov', 'trak'])
        if (found) return found
      }
      if (path.length === 2 && type === 'tkhd') {
        const version = bytes[body]!
        // After version/flags: times, track id, duration, reserved, layer…, a 36-byte matrix, then 16.16 width/height.
        const at = body + 4 + (version === 1 ? 32 : 20) + 8 + 8 + 36
        if (at + 8 > offset + size) return null
        const width = view.getUint32(at) >>> 16
        const height = view.getUint32(at + 4) >>> 16
        if (width > 0 && height > 0) return { width, height }
      }
      offset += size
    }
    return null
  }
  return walk(0, bytes.length, [])
}

/** Recognizes the file types onboardings accept (PNG, JPEG, WebP, MP4) and reads their pixel size. */
export function mediaInfo(bytes: Uint8Array): MediaInfo | null {
  const image = contentTypeFor(bytes)
  if (image) return { contentType: image, size: imageSize(bytes) }
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return { contentType: 'image/webp', size: webpSize(bytes) }
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4)
    return { contentType: brand === 'qt  ' ? 'video/quicktime' : 'video/mp4', size: mp4Size(bytes) }
  }
  return null
}

export const extensionFor = (contentType: string) =>
  ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov' })[
    contentType
  ] ?? 'bin'
