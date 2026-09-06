import { describe, expect, it } from 'vitest'
import { compareVersions } from './releases'

describe('compareVersions', () => {
  it('orders numerically per segment', () => {
    const sorted = ['2.9.9', '3.0.1', '2.10.0', '1.0', '3.0.0'].sort((a, b) => compareVersions(b, a))
    expect(sorted).toEqual(['3.0.1', '3.0.0', '2.10.0', '2.9.9', '1.0'])
  })
})
