import { describe, it, expect } from 'vitest'
import { CURRENCIES, DEFAULT_CURRENCY } from '../currencies'

describe('currency presets', () => {
  it('has a non-empty list with a default', () => {
    expect(CURRENCIES.length).toBeGreaterThan(0)
    expect(CURRENCIES).toContain(DEFAULT_CURRENCY)
  })

  it('every preset has a code, symbol, locale and name', () => {
    for (const c of CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/)
      expect(c.symbol.length).toBeGreaterThan(0)
      expect(c.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/)
      expect(c.name.length).toBeGreaterThan(0)
    }
  })

  it('has unique currency codes', () => {
    const codes = CURRENCIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
