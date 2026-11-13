import { api, money } from './api'

export interface ReceiptItem {
  name: string
  qty: number
  lineTotal: number
}

export interface ReceiptData {
  storeName: string
  logo?: string | null
  address: string
  phone: string
  header: string
  footer: string
  dateText: string
  items: ReceiptItem[]
  subtotal: number
  discount: number
  tax: number
  total: number
  paymentLabel: string
  tendered: number
  change: number
  labels: {
    subtotal: string
    discount: string
    tax: string
    total: string
    change: string
  }
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildReceiptBody(d: ReceiptData): string {
  const items = d.items
    .map(
      (it) =>
        `<div class="r-item"><span class="r-item-name">${esc(it.name)}</span>` +
        `<span class="r-item-qty">×${it.qty}</span>` +
        `<span class="r-item-amt">${esc(money(it.lineTotal))}</span></div>`
    )
    .join('')
  return `
    ${d.logo ? `<div class="r-logo"><img src="${esc(d.logo)}" alt=""></div>` : ''}
    <div class="r-store">${esc(d.storeName)}</div>
    ${d.address ? `<div class="r-sub">${esc(d.address)}</div>` : ''}
    ${d.phone ? `<div class="r-sub">${esc(d.phone)}</div>` : ''}
    ${d.header ? `<div class="r-sub">${esc(d.header)}</div>` : ''}
    <div class="r-date">${esc(d.dateText)}</div>
    <div class="r-sep"></div>
    ${items}
    <div class="r-sep"></div>
    <div class="r-row"><span>${esc(d.labels.subtotal)}</span><span>${esc(money(d.subtotal))}</span></div>
    ${
      d.discount > 0
        ? `<div class="r-row"><span>${esc(d.labels.discount)}</span><span>- ${esc(money(d.discount))}</span></div>`
        : ''
    }
    <div class="r-row"><span>${esc(d.labels.tax)}</span><span>${esc(money(d.tax))}</span></div>
    <div class="r-row r-total"><span>${esc(d.labels.total)}</span><span>${esc(money(d.total))}</span></div>
    <div class="r-row"><span>${esc(d.paymentLabel)}</span><span>${esc(money(d.tendered))}</span></div>
    <div class="r-row"><span>${esc(d.labels.change)}</span><span>${esc(money(d.change))}</span></div>
    ${d.footer ? `<div class="r-footer">${esc(d.footer)}</div>` : ''}
  `
}

const RECEIPT_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 4mm; width: 72mm; font-family: 'Courier New', monospace; color: #000; font-size: 12px; }
  .r-logo { text-align: center; margin-bottom: 4px; }
  .r-logo img { max-width: 40mm; max-height: 22mm; }
  .r-store { font-size: 16px; font-weight: 700; text-align: center; }
  .r-sub, .r-date { text-align: center; }
  .r-footer { text-align: center; margin-top: 10px; }
  .r-sep { border-top: 1px dashed #000; margin: 6px 0; }
  .r-item, .r-row { display: flex; justify-content: space-between; gap: 8px; }
  .r-item-name { flex: 1; }
  .r-item-qty { width: 36px; text-align: center; }
  .r-total { font-weight: 700; font-size: 14px; margin-top: 2px; }
  .r-detail { text-align: left; color: #444; font-size: 11px; margin: 0 0 4px; }
`

// ---- Customer statement ----

export interface StatementEntry {
  label: string
  detail: string | null
  amount: number
  sign: '+' | '-'
  dateText: string
}

export interface StatementData {
  storeName: string
  address: string
  phone: string
  customerName: string
  customerPhone: string
  dateText: string
  title: string
  balanceLabel: string
  entries: StatementEntry[]
  balance: number
}

function buildStatementBody(d: StatementData): string {
  const rows = d.entries
    .map(
      (en) =>
        `<div class="r-row"><span>${esc(en.label)} · ${esc(en.dateText)}</span>` +
        `<span>${en.sign} ${esc(money(en.amount))}</span></div>` +
        (en.detail ? `<div class="r-detail">${esc(en.detail)}</div>` : '')
    )
    .join('')
  return `
    <div class="r-store">${esc(d.storeName)}</div>
    ${d.address ? `<div class="r-sub">${esc(d.address)}</div>` : ''}
    ${d.phone ? `<div class="r-sub">${esc(d.phone)}</div>` : ''}
    <div class="r-sep"></div>
    <div class="r-sub"><b>${esc(d.title)}</b></div>
    <div class="r-sub">${esc(d.customerName)}${
      d.customerPhone ? ' · ' + esc(d.customerPhone) : ''
    }</div>
    <div class="r-date">${esc(d.dateText)}</div>
    <div class="r-sep"></div>
    ${rows}
    <div class="r-sep"></div>
    <div class="r-row r-total"><span>${esc(d.balanceLabel)}</span><span>${esc(money(d.balance))}</span></div>
  `
}

export async function printStatement(d: StatementData): Promise<void> {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${RECEIPT_CSS}</style></head><body>${buildStatementBody(
    d
  )}</body></html>`
  const ok = await api.receipt.print(html)
  if (ok) return
  let el = document.getElementById('receipt-print')
  if (!el) {
    el = document.createElement('div')
    el.id = 'receipt-print'
    document.body.appendChild(el)
  }
  el.innerHTML = buildStatementBody(d)
  window.print()
}

// Full standalone HTML document for silent printing in an offscreen window.
function receiptDocument(d: ReceiptData): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${RECEIPT_CSS}</style></head><body>${buildReceiptBody(
    d
  )}</body></html>`
}

// Print the receipt. Tries silent printing to the default printer first; if that
// fails (no default printer, driver issue), falls back to the system print dialog.
export async function printReceipt(d: ReceiptData): Promise<void> {
  const ok = await api.receipt.print(receiptDocument(d))
  if (ok) return
  // Fallback: reveal the hidden receipt node and open the print dialog.
  let el = document.getElementById('receipt-print')
  if (!el) {
    el = document.createElement('div')
    el.id = 'receipt-print'
    document.body.appendChild(el)
  }
  el.innerHTML = buildReceiptBody(d)
  window.print()
}
