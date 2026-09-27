import { describe, expect, it } from 'vitest'
import { mediaInfo } from './media'

const text = (s: string) => [...s].map((c) => c.charCodeAt(0))

function webp(chunk: 'VP8 ' | 'VP8L' | 'VP8X', width: number, height: number) {
  const b = new Uint8Array(40)
  b.set(text('RIFF'), 0)
  b.set(text('WEBP'), 8)
  b.set(text(chunk), 12)
  const view = new DataView(b.buffer)
  if (chunk === 'VP8 ') {
    view.setUint16(26, width, true)
    view.setUint16(28, height, true)
  } else if (chunk === 'VP8L') {
    view.setUint32(21, (width - 1) | ((height - 1) << 14), true)
  } else {
    view.setUint32(24, width - 1, true)
    view.setUint32(27, height - 1, true)
  }
  return b
}

function box(type: string, body: number[]) {
  const size = 8 + body.length
  return [(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...text(type), ...body]
}

/** ftyp + moov with an audio track (no size) and then a video track. */
function mp4(width: number, height: number) {
  const tkhd = (w: number, h: number) => {
    const body = new Uint8Array(84)
    const view = new DataView(body.buffer)
    view.setUint32(76, w << 16)
    view.setUint32(80, h << 16)
    return box('tkhd', [...body])
  }
  const trak = (w: number, h: number) => box('trak', tkhd(w, h))
  return new Uint8Array([...box('ftyp', text('isom0000')), ...box('moov', [...trak(0, 0), ...trak(width, height)])])
}

describe('mediaInfo', () => {
  it('reads WebP sizes from all three chunk kinds', () => {
    expect(mediaInfo(webp('VP8 ', 1200, 900))).toEqual({
      contentType: 'image/webp',
      size: { width: 1200, height: 900 },
    })
    expect(mediaInfo(webp('VP8L', 321, 123))?.size).toEqual({ width: 321, height: 123 })
    expect(mediaInfo(webp('VP8X', 4000, 3000))?.size).toEqual({ width: 4000, height: 3000 })
  })

  it('reads the video track size of an MP4', () => {
    expect(mediaInfo(mp4(640, 360))).toEqual({ contentType: 'video/mp4', size: { width: 640, height: 360 } })
  })

  it('knows the type but not the size of a truncated MP4', () => {
    expect(mediaInfo(new Uint8Array(box('ftyp', text('isom0000'))))).toEqual({ contentType: 'video/mp4', size: null })
  })

  it('returns null for unknown data', () => {
    expect(mediaInfo(new Uint8Array(text('hello, world!!!!')))).toBeNull()
  })
})
