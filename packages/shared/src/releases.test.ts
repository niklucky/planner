import { describe, expect, it } from 'vitest'
import { compareVersions } from './releases'

describe('compareVersions', () => {
  it('orders numerically per segment', () => {
    const sorted = ['2.9.9', '3.0.1', '2.10.0', '1.0', '3.0.0'].sort((a, b) => compareVersions(b, a))
    expect(sorted).toEqual(['3.0.1', '3.0.0', '2.10.0', '2.9.9', '1.0'])
  })
})

import { planPush } from './releases'

describe('planPush', () => {
  const versions = [
    { id: 'v1', appName: 'App', versionString: '1.1', state: 'PREPARE_FOR_SUBMISSION', platform: 'ios' as const },
    { id: 'v0', appName: 'App', versionString: '1.0', state: 'READY_FOR_DISTRIBUTION', platform: 'ios' as const },
  ]

  it('splits locales into changes, unchanged and missing', () => {
    const [plan] = planPush({
      notesMode: 'shared',
      notes: [
        { scope: 'shared', locale: 'en-US', text: 'New' },
        { scope: 'shared', locale: 'de-DE', text: 'Same' },
        { scope: 'shared', locale: 'fr-FR', text: 'No store row' },
        { scope: 'shared', locale: 'it', text: '   ' },
      ],
      versions: [versions[0]!],
      storeLocalizations: [
        { appVersionId: 'v1', locale: 'en-US', whatsNew: 'Old' },
        { appVersionId: 'v1', locale: 'de-DE', whatsNew: 'Same' },
      ],
    })
    expect(plan!.editable).toBe(true)
    expect(plan!.changes).toEqual([{ locale: 'en-US', from: 'Old', to: 'New' }])
    expect(plan!.unchanged).toEqual(['de-DE'])
    expect(plan!.missingInStore).toEqual(['fr-FR'])
  })

  it('marks live versions as not editable and uses platform notes in per-platform mode', () => {
    const plans = planPush({
      notesMode: 'per_platform',
      notes: [
        { scope: 'shared', locale: 'en-US', text: 'Shared text' },
        { scope: 'ios', locale: 'en-US', text: 'iOS text' },
      ],
      versions,
      storeLocalizations: [{ appVersionId: 'v1', locale: 'en-US', whatsNew: null }],
    })
    expect(plans.map((p) => p.editable)).toEqual([true, false])
    expect(plans[0]!.changes[0]!.to).toBe('iOS text')
  })
})
