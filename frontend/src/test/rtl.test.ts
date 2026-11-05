import { describe, it, expect, afterEach } from 'vitest'
import i18n, { isRtl } from '../i18n'

describe('right-to-left languages', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('knows which languages are written right to left', () => {
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('ur')).toBe(true)
    expect(isRtl('ur-PK')).toBe(true)
    for (const code of ['en', 'hi', 'te', 'ta', 'zh', 'ja', 'sw', '', undefined]) expect(isRtl(code)).toBe(false)
  })

  it('mirrors the page and tells the browser the language when Arabic or Urdu is chosen, and restores it after', async () => {
    await i18n.changeLanguage('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
    await i18n.changeLanguage('ur')
    expect(document.documentElement.dir).toBe('rtl')
    await i18n.changeLanguage('te')
    expect(document.documentElement.dir).toBe('ltr')
    expect(document.documentElement.lang).toBe('te')
  })
})
