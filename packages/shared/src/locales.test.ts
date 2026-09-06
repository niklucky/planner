import { describe, expect, it } from 'vitest'
import { matchLocale } from './locales'

const google = ['ar', 'de-DE', 'en-US', 'en-GB', 'es-ES', 'es-419', 'hi-IN', 'ru-RU', 'zh-CN', 'zh-TW', 'pt-BR', 'pt-PT']

describe('matchLocale', () => {
  it('matches exact and case-insensitive', () => {
    expect(matchLocale('de-DE', google)).toBe('de-DE')
    expect(matchLocale('en-us', google)).toBe('en-US')
  })
  it('maps Apple locales to Google counterparts', () => {
    expect(matchLocale('ru', google)).toBe('ru-RU')
    expect(matchLocale('hi', google)).toBe('hi-IN')
    expect(matchLocale('zh-Hans', google)).toBe('zh-CN')
    expect(matchLocale('zh-Hant', google)).toBe('zh-TW')
    expect(matchLocale('ar-SA', google)).toBe('ar')
    expect(matchLocale('es-MX', google)).toBe('es-419')
  })
  it('maps Google locales back to Apple', () => {
    const apple = ['ar-SA', 'ru', 'zh-Hans', 'zh-Hant', 'es-MX', 'pt-BR']
    expect(matchLocale('ru-RU', apple)).toBe('ru')
    expect(matchLocale('zh-CN', apple)).toBe('zh-Hans')
    expect(matchLocale('ar', apple)).toBe('ar-SA')
    expect(matchLocale('es-419', apple)).toBe('es-MX')
  })
  it('returns undefined without a shared language', () => {
    expect(matchLocale('ja', google)).toBeUndefined()
  })
})
