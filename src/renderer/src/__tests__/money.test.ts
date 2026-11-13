import { describe, it, expect, beforeEach } from 'vitest'
import { money, setCurrency } from '../api'

describe('money', () => {
  beforeEach(() => setCurrency('Rs', 'en-PK'))

  it('formats with the default currency symbol and 2 decimals', () => {
    expect(money(1234.5)).toBe('Rs 1,234.50')
    expect(money(0)).toBe('Rs 0.00')
  })

  it('reflects a changed currency', () => {
    setCurrency('$', 'en-US')
    expect(money(1000)).toBe('$ 1,000.00')
  })

  it('falls back to Rs / en-PK when given nulls', () => {
    setCurrency(null, null)
    expect(money(5)).toBe('Rs 5.00')
  })
})
