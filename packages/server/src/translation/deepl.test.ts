import { describe, expect, it } from 'vitest'
import { deeplSource, deeplTarget } from './deepl'

describe('DeepL locale mapping', () => {
  it('maps store locales to DeepL targets', () => {
    expect(deeplTarget('en-US')).toBe('EN-US')
    expect(deeplTarget('en-AU')).toBe('EN-GB')
    expect(deeplTarget('pt-BR')).toBe('PT-BR')
    expect(deeplTarget('zh-Hans')).toBe('ZH-HANS')
    expect(deeplTarget('zh-TW')).toBe('ZH-HANT')
    expect(deeplTarget('ru-RU')).toBe('RU')
    expect(deeplTarget('de-DE')).toBe('DE')
  })
  it('reports unsupported languages', () => {
    expect(deeplTarget('hi')).toBeNull()
    expect(deeplTarget('vi')).toBeNull()
  })
  it('derives the source language', () => {
    expect(deeplSource('en-US')).toBe('EN')
  })
})
