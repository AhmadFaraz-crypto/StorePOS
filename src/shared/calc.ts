// Pure money math shared by the renderer (cart totals) and the main process
// (stored sale totals), so the number the cashier sees always matches what is
// saved. Kept dependency-free so it is unit-testable in plain Node.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export interface SaleLineInput {
  unitPrice: number
  qty: number
  taxRate: number // fraction, e.g. 0.05 for 5%
  discount?: number // absolute amount off this line (pre-tax)
}

export interface SaleTotals {
  subtotal: number // gross, before any discount
  discount: number // total discount (line + cart)
  tax: number
  total: number
}

// Convert a line to ex-tax figures. In tax-inclusive mode the unit price already
// contains tax, so we divide it out; otherwise the price is the ex-tax base.
export interface LineEx {
  grossEx: number
  discEx: number
  netEx: number
  rate: number
}
export function lineEx(l: SaleLineInput, inclusive = false): LineEx {
  const grossRaw = l.unitPrice * l.qty
  const grossEx = inclusive ? grossRaw / (1 + l.taxRate) : grossRaw
  const discRaw = Math.min(Math.max(l.discount ?? 0, 0), grossRaw)
  const discEx = inclusive ? discRaw / (1 + l.taxRate) : discRaw
  return { grossEx, discEx, netEx: grossEx - discEx, rate: l.taxRate }
}

// Net of a single line after its own line discount (ex-tax, never negative).
export function lineNet(l: SaleLineInput, inclusive = false): number {
  return lineEx(l, inclusive).netEx
}

// Sum of ex-tax line nets — the base a percentage cart discount applies to.
export function netSubtotal(lines: SaleLineInput[], inclusive = false): number {
  return lines.reduce((s, l) => s + lineNet(l, inclusive), 0)
}

// cartDiscount is an absolute amount off the whole order (after line discounts).
// It reduces each line's taxable base proportionally. All stored/returned amounts
// are ex-tax (plus the tax field), so reports work the same in either mode.
export function calcTotals(
  lines: SaleLineInput[],
  cartDiscount = 0,
  inclusive = false
): SaleTotals {
  const exs = lines.map((l) => lineEx(l, inclusive))
  let subtotalEx = 0
  let lineDiscEx = 0
  for (const e of exs) {
    subtotalEx += e.grossEx
    lineDiscEx += e.discEx
  }
  const afterLine = subtotalEx - lineDiscEx
  const cartDisc = Math.min(Math.max(cartDiscount, 0), afterLine)
  const factor = afterLine > 0 ? (afterLine - cartDisc) / afterLine : 0

  let tax = 0
  for (const e of exs) {
    tax += e.netEx * e.rate * factor
  }

  return {
    subtotal: round2(subtotalEx),
    discount: round2(lineDiscEx + cartDisc),
    tax: round2(tax),
    total: round2(afterLine - cartDisc + tax)
  }
}

// ---- Purchases (stock-in) ----

export function purchaseTotal(lines: { qty: number; unitCost: number }[]): number {
  return round2(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))
}

// ---- Refunds ----
// A refund returns part (or all) of an original sale. Amounts are computed
// proportionally from the original line values; tax is allocated by the share
// of the original net being refunded. All returned numbers are positive — the
// caller stores them as negatives on the refund record.

export interface RefundLineCalc {
  origQty: number
  lineTotal: number // original gross for the whole line
  discount: number // original discount for the whole line
  refundQty: number
}

export interface RefundResult {
  subtotal: number
  discount: number
  tax: number
  total: number
  lines: { gross: number; discount: number }[]
}

export function calcRefund(
  lines: RefundLineCalc[],
  originalTax: number,
  originalNet: number
): RefundResult {
  let subtotal = 0
  let discount = 0
  const out = lines.map((l) => {
    const gross = l.origQty > 0 ? (l.lineTotal / l.origQty) * l.refundQty : 0
    const disc = l.origQty > 0 ? (l.discount / l.origQty) * l.refundQty : 0
    subtotal += gross
    discount += disc
    return { gross: round2(gross), discount: round2(disc) }
  })
  const net = subtotal - discount
  const tax = originalNet > 0 ? originalTax * (net / originalNet) : 0
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    tax: round2(tax),
    total: round2(net + tax),
    lines: out
  }
}
