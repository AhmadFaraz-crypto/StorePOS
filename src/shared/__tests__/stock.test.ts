import { describe, it, expect } from 'vitest'
import { stockLevel, LOW_STOCK_THRESHOLD } from '../stock'

describe('stockLevel', () => {
  it('is "out" at or below zero', () => {
    expect(stockLevel(0)).toBe('out')
    expect(stockLevel(-3)).toBe('out')
  })

  it('is "low" from 1 up to the threshold', () => {
    expect(stockLevel(1)).toBe('low')
    expect(stockLevel(LOW_STOCK_THRESHOLD)).toBe('low')
  })

  it('is "ok" above the threshold', () => {
    expect(stockLevel(LOW_STOCK_THRESHOLD + 1)).toBe('ok')
    expect(stockLevel(100)).toBe('ok')
  })

  it('respects a custom threshold', () => {
    expect(stockLevel(8, 10)).toBe('low')
    expect(stockLevel(11, 10)).toBe('ok')
  })
})
