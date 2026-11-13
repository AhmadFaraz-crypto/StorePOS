import { describe, it, expect, beforeEach } from 'vitest'
import { esc, buildReceiptBody, type ReceiptData } from '../receipt'
import { setCurrency } from '../api'

const base: ReceiptData = {
  storeName: 'My Store',
  address: '',
  phone: '',
  header: '',
  footer: '',
  dateText: '2026-11-06 14:00',
  items: [
    { name: 'Coca-Cola 500ml', qty: 2, lineTotal: 3 },
    { name: 'Bread', qty: 1, lineTotal: 2.29 }
  ],
  subtotal: 5.29,
  discount: 0,
  tax: 0.15,
  total: 5.44,
  paymentLabel: 'Cash',
  tendered: 10,
  change: 4.56,
  labels: {
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    total: 'Total',
    change: 'Change'
  }
}

describe('esc', () => {
  it('escapes HTML-significant characters', () => {
    expect(esc('A & <b> "c"')).toBe('A &amp; &lt;b&gt; "c"')
  })
})

describe('buildReceiptBody', () => {
  beforeEach(() => setCurrency('Rs', 'en-PK'))

  it('includes store name, every item and the totals', () => {
    const html = buildReceiptBody(base)
    expect(html).toContain('My Store')
    expect(html).toContain('Coca-Cola 500ml')
    expect(html).toContain('Bread')
    expect(html).toContain('×2')
    expect(html).toContain('Rs 5.44') // total
    expect(html).toContain('Rs 4.56') // change
    expect(html).toContain('Subtotal')
  })

  it('omits address and phone when empty', () => {
    const html = buildReceiptBody(base)
    expect(html).not.toContain('class="r-sub"')
  })

  it('shows a discount line only when there is a discount', () => {
    expect(buildReceiptBody(base)).not.toContain('Discount')
    const withDisc = buildReceiptBody({ ...base, discount: 1.5 })
    expect(withDisc).toContain('Discount')
    expect(withDisc).toContain('Rs 1.50')
  })

  it('shows address and phone when provided', () => {
    const html = buildReceiptBody({ ...base, address: '12 Main Rd', phone: '0300-1234567' })
    expect(html).toContain('12 Main Rd')
    expect(html).toContain('0300-1234567')
  })

  it('escapes a product name containing HTML', () => {
    const html = buildReceiptBody({
      ...base,
      items: [{ name: 'Juice <2L>', qty: 1, lineTotal: 1 }]
    })
    expect(html).toContain('Juice &lt;2L&gt;')
    expect(html).not.toContain('<2L>')
  })
})
