import { describe, it, expect } from 'vitest'
import i18next from 'i18next'
import en from '../i18n/en.json'
import ur from '../i18n/ur.json'
import ar from '../i18n/ar.json'
import hi from '../i18n/hi.json'
import es from '../i18n/es.json'
import de from '../i18n/de.json'
import zh from '../i18n/zh.json'
import { LANGUAGES } from '../i18n'

const LOCALES: Record<string, unknown> = { ur, ar, hi, es, de, zh }
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

// Flatten to dotted keys, collapsing plural variants to one base key so locales
// with different plural rules (Arabic 6 forms, Chinese 1) still compare equal.
function keySet(obj: unknown, prefix = ''): Set<string> {
  const out = new Set<string>()
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = (prefix ? prefix + '.' + k : k).replace(PLURAL_SUFFIX, '')
    if (v && typeof v === 'object') {
      for (const nested of keySet(v, prefix ? prefix + '.' + k : k)) out.add(nested)
    } else {
      out.add(key)
    }
  }
  return out
}

// The `lang.*` entries are language display-names, not translatable UI strings,
// and are allowed to differ between locales — exclude them from parity.
const uiKeys = (data: unknown): Set<string> =>
  new Set([...keySet(data)].filter((k) => !k.startsWith('lang')))

describe('locale key parity', () => {
  const enKeys = uiKeys(en)
  for (const [code, data] of Object.entries(LOCALES)) {
    it(`${code} has the same keys as en`, () => {
      const keys = uiKeys(data)
      const missing = [...enKeys].filter((k) => !keys.has(k))
      const extra = [...keys].filter((k) => !enKeys.has(k))
      expect({ code, missing, extra }).toEqual({ code, missing: [], extra: [] })
    })
  }
})

describe('plural resolution', () => {
  const resources = {
    en: { translation: en },
    ar: { translation: ar },
    zh: { translation: zh }
  }

  it('resolves product count plurals without falling back to the key', async () => {
    const inst = i18next.createInstance()
    await inst.init({ lng: 'ar', fallbackLng: 'en', resources, interpolation: { escapeValue: false } })
    for (const n of [0, 1, 2, 5, 15, 100]) {
      const t = inst.getFixedT('ar')
      const out = t('products.count', { count: n })
      expect(out).not.toBe('products.count')
      expect(out.length).toBeGreaterThan(0)
    }
  })

  it('Chinese uses a single form that still includes the count', async () => {
    const inst = i18next.createInstance()
    await inst.init({ lng: 'zh', fallbackLng: 'en', resources, interpolation: { escapeValue: false } })
    const t = inst.getFixedT('zh')
    expect(t('products.count', { count: 7 })).toContain('7')
  })
})

describe('language directions', () => {
  it('marks Urdu and Arabic as RTL, others LTR', () => {
    const dir = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.dir]))
    expect(dir.ur).toBe('rtl')
    expect(dir.ar).toBe('rtl')
    expect(dir.en).toBe('ltr')
    expect(dir.hi).toBe('ltr')
    expect(dir.es).toBe('ltr')
    expect(dir.de).toBe('ltr')
    expect(dir.zh).toBe('ltr')
  })
})
