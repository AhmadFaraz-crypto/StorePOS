import { describe, it, expect } from 'vitest'
import { round2, calcTotals, lineNet, netSubtotal, calcRefund, purchaseTotal } from '../calc'

describe('round2', () => {
  it('rounds to 2 decimals and fixes float error', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.5)).toBe(2.5)
    expect(round2(0)).toBe(0)
  })
})

describe('lineNet / netSubtotal', () => {
  it('subtracts the line discount, never below zero', () => {
    expect(lineNet({ unitPrice: 10, qty: 2, taxRate: 0, discount: 5 })).toBe(15)
    expect(lineNet({ unitPrice: 10, qty: 1, taxRate: 0, discount: 999 })).toBe(0)
  })
  it('sums line nets', () => {
    expect(
      netSubtotal([
        { unitPrice: 10, qty: 1, taxRate: 0, discount: 2 },
        { unitPrice: 5, qty: 2, taxRate: 0 }
      ])
    ).toBe(18)
  })
})

describe('calcTotals without discounts', () => {
  it('returns zeroes for an empty cart', () => {
    expect(calcTotals([])).toEqual({ subtotal: 0, discount: 0, tax: 0, total: 0 })
  })

  it('computes subtotal, tax and total for mixed tax rates', () => {
    const totals = calcTotals([
      { unitPrice: 1.5, qty: 3, taxRate: 0.05 },
      { unitPrice: 2.49, qty: 2, taxRate: 0.07 }
    ])
    expect(totals).toEqual({ subtotal: 9.48, discount: 0, tax: 0.57, total: 10.05 })
  })
})

describe('calcTotals with discounts', () => {
  it('applies a line discount and taxes the net amount', () => {
    // 10.00 line, 2.00 off, 10% tax on the remaining 8.00 → tax 0.80, total 8.80
    const totals = calcTotals([{ unitPrice: 10, qty: 1, taxRate: 0.1, discount: 2 }])
    expect(totals).toEqual({ subtotal: 10, discount: 2, tax: 0.8, total: 8.8 })
  })

  it('applies a whole-cart discount and scales tax proportionally', () => {
    // subtotal 100 @10% tax; 20 cart discount → taxable 80, tax 8.00, total 88.00
    const totals = calcTotals([{ unitPrice: 100, qty: 1, taxRate: 0.1 }], 20)
    expect(totals).toEqual({ subtotal: 100, discount: 20, tax: 8, total: 88 })
  })

  it('combines line and cart discounts', () => {
    // line: 50 - 10 = 40 ; cart 10 off → taxable 30 (no tax) ; total 30
    const totals = calcTotals([{ unitPrice: 50, qty: 1, taxRate: 0, discount: 10 }], 10)
    expect(totals).toEqual({ subtotal: 50, discount: 20, tax: 0, total: 30 })
  })

  it('caps the cart discount at the post-line subtotal', () => {
    const totals = calcTotals([{ unitPrice: 10, qty: 1, taxRate: 0 }], 999)
    expect(totals).toEqual({ subtotal: 10, discount: 10, tax: 0, total: 0 })
  })

  it('total always equals subtotal - discount + tax', () => {
    const totals = calcTotals(
      [
        { unitPrice: 3.33, qty: 3, taxRate: 0.1, discount: 1 },
        { unitPrice: 1.11, qty: 7, taxRate: 0.17 }
      ],
      2
    )
    expect(totals.total).toBe(round2(totals.subtotal - totals.discount + totals.tax))
  })
})

describe('calcTotals tax-inclusive', () => {
  it('extracts tax from a tax-inclusive price', () => {
    // 110 incl @10% → ex-tax 100, tax 10, total 110
    const totals = calcTotals([{ unitPrice: 110, qty: 1, taxRate: 0.1 }], 0, true)
    expect(totals).toEqual({ subtotal: 100, discount: 0, tax: 10, total: 110 })
  })

  it('handles a line discount in inclusive mode', () => {
    // 110 incl, 11 off (incl) → ex gross 100, ex disc 10, net 90, tax 9, total 99
    const totals = calcTotals([{ unitPrice: 110, qty: 1, taxRate: 0.1, discount: 11 }], 0, true)
    expect(totals).toEqual({ subtotal: 100, discount: 10, tax: 9, total: 99 })
  })

  it('a zero-tax inclusive line equals its price', () => {
    const totals = calcTotals([{ unitPrice: 50, qty: 2, taxRate: 0 }], 0, true)
    expect(totals).toEqual({ subtotal: 100, discount: 0, tax: 0, total: 100 })
  })
})

describe('purchaseTotal', () => {
  it('sums qty × unit cost', () => {
    expect(
      purchaseTotal([
        { qty: 10, unitCost: 0.9 },
        { qty: 5, unitCost: 2.4 }
      ])
    ).toBe(21)
  })
  it('is zero for no lines', () => {
    expect(purchaseTotal([])).toBe(0)
  })
})

describe('calcRefund', () => {
  it('full refund returns the whole original amount', () => {
    // Original: 1 line, 2 qty, gross 20, no discount, tax 2.00 (net 20)
    const r = calcRefund([{ origQty: 2, lineTotal: 20, discount: 0, refundQty: 2 }], 2, 20)
    expect(r).toEqual({
      subtotal: 20,
      discount: 0,
      tax: 2,
      total: 22,
      lines: [{ gross: 20, discount: 0 }]
    })
  })

  it('partial refund is proportional, tax allocated by net share', () => {
    // Original: 4 qty, gross 40, tax 4.00 (net 40). Refund 1 of 4 → gross 10, tax 1.00
    const r = calcRefund([{ origQty: 4, lineTotal: 40, discount: 0, refundQty: 1 }], 4, 40)
    expect(r.subtotal).toBe(10)
    expect(r.tax).toBe(1)
    expect(r.total).toBe(11)
  })

  it('carries a proportional share of the original discount', () => {
    // 2 qty, gross 20, discount 4 (net 16), no tax. Refund 1 → gross 10, disc 2, total 8
    const r = calcRefund([{ origQty: 2, lineTotal: 20, discount: 4, refundQty: 1 }], 0, 16)
    expect(r).toEqual({
      subtotal: 10,
      discount: 2,
      tax: 0,
      total: 8,
      lines: [{ gross: 10, discount: 2 }]
    })
  })

  it('refunding nothing yields zero', () => {
    const r = calcRefund([{ origQty: 3, lineTotal: 30, discount: 0, refundQty: 0 }], 3, 30)
    expect(r.total).toBe(0)
  })
})
