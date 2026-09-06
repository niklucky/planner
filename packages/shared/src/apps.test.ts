import { describe, expect, it } from 'vitest'
import { createAppInput } from './apps'

describe('createAppInput', () => {
  it('accepts a valid app', () => {
    const result = createAppInput.safeParse({ name: 'Demo', platform: 'ios', bundleId: 'com.example.demo' })
    expect(result.success).toBe(true)
  })

  it('rejects unknown platform', () => {
    const result = createAppInput.safeParse({ name: 'Demo', platform: 'web', bundleId: 'x' })
    expect(result.success).toBe(false)
  })
})
