import { describe, expect, it } from 'vitest'
import { inviteTokenFromRedirect } from './invite'

describe('inviteTokenFromRedirect', () => {
  it('extracts the token from an invite return path', () => {
    expect(inviteTokenFromRedirect('/invite?token=abc-DEF_1')).toBe('abc-DEF_1')
  })
  it('ignores other paths and garbage', () => {
    expect(inviteTokenFromRedirect('/projects/x')).toBeUndefined()
    expect(inviteTokenFromRedirect(undefined)).toBeUndefined()
    expect(inviteTokenFromRedirect('/invite')).toBeUndefined()
  })
})
