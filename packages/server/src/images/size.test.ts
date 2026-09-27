import { describe, expect, it } from 'vitest'
import { contentTypeFor, imageSize } from './size'

function png(width: number, height: number) {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 0)
  new DataView(b.buffer).setUint32(16, width)
  new DataView(b.buffer).setUint32(20, height)
  return b
}

function jpeg(width: number, height: number) {
  // SOI, APP0 (length 16), SOF0 with dimensions.
  const b = new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0,
    16,
    ...new Array(14).fill(0),
    0xff,
    0xc0,
    0,
    17,
    8,
    0,
    0,
    0,
    0,
    3,
  ])
  new DataView(b.buffer).setUint16(25, height)
  new DataView(b.buffer).setUint16(27, width)
  return b
}

describe('imageSize', () => {
  it('reads PNG dimensions', () => {
    expect(imageSize(png(1290, 2796))).toEqual({ width: 1290, height: 2796 })
    expect(contentTypeFor(png(1, 1))).toBe('image/png')
  })
  it('reads JPEG dimensions', () => {
    expect(imageSize(jpeg(1080, 1920))).toEqual({ width: 1080, height: 1920 })
    expect(contentTypeFor(jpeg(1, 1))).toBe('image/jpeg')
  })
  it('returns null for unknown data', () => {
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull()
    expect(contentTypeFor(new Uint8Array([1, 2]))).toBeNull()
  })
})
