import { describe, expect, it } from 'vitest'
import { toRemoteVersion } from './client'

describe('Google Play versions', () => {
  it('maps a track release to a store version', () => {
    const v = toRemoteVersion('production', { name: '1.4.2', status: 'inProgress', versionCodes: ['142'] })
    expect(v).toMatchObject({
      id: 'production/1.4.2',
      versionString: '1.4.2',
      platform: 'production',
      state: 'IN_PROGRESS',
    })
  })

  it('falls back to version codes when a release has no name', () => {
    expect(toRemoteVersion('internal', { status: 'draft', versionCodes: ['7'] }).versionString).toBe('7')
  })
})
