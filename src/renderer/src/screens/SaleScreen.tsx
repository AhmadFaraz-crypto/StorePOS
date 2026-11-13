import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, money, currencySymbol } from '../api'
import { printReceipt } from '../receipt'
import { calcTotals, netSubtotal } from '../../../shared/calc'
import { stockLevel } from '../../../shared/stock'
import { useScanner, useScanHandler } from '../ScannerContext'
import ElevateModal from '../components/ElevateModal'
import type { Category, Customer, PaymentMethod, Product, Sale } from '../../../shared/types'

interface ReceiptCfg {
  autoPrint: boolean
  header: string
  footer: string
  storeName: string
  address: string
  phone: string
  logo: string | null
}

interface CartLine {
  product: Product
  qty: number
  discount: number // absolute amount off this line
}

export default function SaleScreen({
  cashierId,
  canDiscount
}: {
  cashierId: string | null
  canDiscount: boolean
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const { requestAddProduct, pendingCreditCustomer, consumePendingCreditCustomer } = useScanner()
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartDiscount, setCartDiscount] = useState('')
  const [cartDiscountType, setCartDiscountType] = useState<'amount' | 'percent'>('amount')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [tendered, setTendered] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [creditPaid, setCreditPaid] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [lastScan, setLastScan] = useState<{ code: string; matched: boolean } | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [taxInclusive, setTaxInclusive] = useState(false)
  const [completedSale, setCompletedSale] = useState<Sale | null>(null)
  const [receiptCfg, setReceiptCfg] = useState<ReceiptCfg>({
    autoPrint: false,
    header: '',
    footer: '',
    storeName: 'StorePOS',
    address: '',
    phone: '',
    logo: null
  })
  const [showShortcuts, setShowShortcuts] = useState(false)
  // Discount gating: cashiers without the 'discount' right unlock it with a manager PIN.
  const [discountPin, setDiscountPin] = useState<string | null>(null)
  const [discountApprover, setDiscountApprover] = useState('')
  const [showDiscountElevate, setShowDiscountElevate] = useState(false)
  const discountUnlocked = canDiscount || discountPin !== null
  const searchRef = useRef<HTMLInputElement>(null)
  const payInputRef = useRef<HTMLInputElement>(null)
  const productsRef = useRef<Product[]>([])

  const loadProducts = (): void => {
    api.products.list().then(setProducts)
  }

  useEffect(() => {
    productsRef.current = products
  }, [products])

  useEffect(() => {
    loadProducts()
    searchRef.current?.focus()
    api.categories.list().then(setCategories)
    api.customers.list().then(setCustomers)
    api.settings.get().then((s) => {
      setReceiptCfg({
        autoPrint: s.autoPrint,
        header: s.receiptHeader,
        footer: s.receiptFooter,
        storeName: s.storeName,
        address: s.address,
        phone: s.phone,
        logo: s.logo
      })
      setTaxInclusive(s.taxInclusive)
    })
  }, [])

  // Codes from the paired phone are routed here while the Sale tab is active.
  useScanHandler((code) => handleScannedCode(code))

  // Started from a customer's "New credit sale" button — preselect credit + customer.
  useEffect(() => {
    if (pendingCreditCustomer) {
      setPaymentMethod('credit')
      setCustomerId(pendingCreditCustomer)
      consumePendingCreditCustomer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCreditCustomer])

  // Match by barcode; tolerate a stray leading zero (UPC-A vs EAN-13).
  const handleScannedCode = (code: string): void => {
    const trimmed = code.trim()
    const product = productsRef.current.find(
      (p) =>
        p.barcode &&
        (p.barcode === trimmed ||
          p.barcode === trimmed.replace(/^0+/, '') ||
          '0' + p.barcode === trimmed)
    )
    setLastScan({ code: trimmed, matched: !!product })
    if (product) {
      addToCart(product)
      flash(t('sale.toastAdded', { name: product.name }))
    } else {
      flash(t('sale.toastNotInCatalog', { code: trimmed }))
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (categoryFilter && p.category_id !== categoryFilter) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q)
    })
  }, [products, search, categoryFilter])

  const addToCart = (product: Product): void => {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id)
      if (existing) {
        return prev.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l))
      }
      return [...prev, { product, qty: 1, discount: 0 }]
    })
    setSearch('')
    searchRef.current?.focus()
  }

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter') return
    const term = search.trim()
    if (!term) return
    const exact = products.find((p) => p.barcode && p.barcode === term)
    if (exact) {
      addToCart(exact)
      return
    }
    if (filtered.length === 1) {
      addToCart(filtered[0])
      return
    }
    flash(t('sale.toastNoMatch'))
  }

  const setQty = (id: string, qty: number): void => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.product.id !== id))
      return
    }
    setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, qty } : l)))
  }

  const setLineDiscount = (id: string, discount: number): void => {
    setCart((prev) =>
      prev.map((l) => (l.product.id === id ? { ...l, discount: Math.max(discount, 0) } : l))
    )
  }

  const lineInputs = useMemo(
    () =>
      cart.map((l) => ({
        unitPrice: l.product.price,
        qty: l.qty,
        taxRate: l.product.tax_rate,
        discount: l.discount
      })),
    [cart]
  )

  // Resolve the cart discount (percent is relative to the post-line-discount net).
  const cartDiscountAmount = useMemo(() => {
    const v = parseFloat(cartDiscount) || 0
    if (v <= 0) return 0
    return cartDiscountType === 'percent' ? (netSubtotal(lineInputs, taxInclusive) * v) / 100 : v
  }, [cartDiscount, cartDiscountType, lineInputs, taxInclusive])

  const { subtotal, discount, tax, total } = useMemo(
    () => calcTotals(lineInputs, cartDiscountAmount, taxInclusive),
    [lineInputs, cartDiscountAmount, taxInclusive]
  )

  const tenderedNum = parseFloat(tendered) || 0
  const changeDue = tenderedNum - total

  const flash = (msg: string): void => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }

  const printSaleReceipt = (sale: Sale): void => {
    void printReceipt({
      storeName: receiptCfg.storeName,
      logo: receiptCfg.logo,
      address: receiptCfg.address,
      phone: receiptCfg.phone,
      header: receiptCfg.header,
      footer: receiptCfg.footer,
      dateText: new Date(sale.created_at).toLocaleString(i18n.language),
      items: sale.items.map((it) => ({ name: it.name, qty: it.qty, lineTotal: it.line_total })),
      subtotal: sale.subtotal,
      discount: sale.discount,
      tax: sale.tax,
      total: sale.total,
      paymentLabel: t('sale.' + sale.payment_method),
      tendered: sale.tendered,
      change: sale.change_due,
      labels: {
        subtotal: t('sale.subtotal'),
        discount: t('sale.discount'),
        tax: t('sale.tax'),
        total: t('sale.total'),
        change: t('sale.change')
      }
    })
  }

  const creditPaidNum = parseFloat(creditPaid) || 0

  const finalize = async (): Promise<void> => {
    if (cart.length === 0) return
    if (paymentMethod === 'cash' && tenderedNum < total) {
      flash(t('sale.toastTenderLow'))
      return
    }
    if (paymentMethod === 'credit' && !customerId) {
      flash(t('sale.toastPickCustomer'))
      return
    }
    let sale: Sale
    try {
      sale = await api.sales.create({
        items: cart.map((l) => ({
          product_id: l.product.id,
          qty: l.qty,
          unit_price: l.product.price,
          tax_rate: l.product.tax_rate,
          discount: l.discount
        })),
        payment_method: paymentMethod,
        tendered:
          paymentMethod === 'cash' ? tenderedNum : paymentMethod === 'credit' ? creditPaidNum : total,
        discount: cartDiscountAmount,
        customer_id: paymentMethod === 'credit' ? customerId : null,
        paid: paymentMethod === 'credit' ? creditPaidNum : total,
        cashier_id: cashierId,
        discountApprovalPin: discountPin ?? undefined
      })
    } catch (err) {
      flash(
        String(err).includes('FORBIDDEN:discount')
          ? t('elevate.deniedDiscount')
          : t('sale.toastError')
      )
      return
    }
    setCompletedSale(sale)
    setCart([])
    setTendered('')
    setCreditPaid('')
    setCustomerId('')
    setCartDiscount('')
    setDiscountPin(null)
    setDiscountApprover('')
    loadProducts()
    api.customers.list().then(setCustomers)
    if (receiptCfg.autoPrint) printSaleReceipt(sale)
  }

  // Close the sale-complete dialog and return to a fresh sale.
  const startNewSale = (): void => {
    setCompletedSale(null)
    searchRef.current?.focus()
  }

  // Keep the keyboard handler pointed at the latest closures without re-binding.
  const kbd = useRef({ finalize, startNewSale, completedSale, showShortcuts })
  kbd.current = { finalize, startNewSale, completedSale, showShortcuts }

  useEffect(() => {
    const editable = (el: EventTarget | null): boolean => {
      const n = el as HTMLElement | null
      if (!n) return false
      return (
        n.tagName === 'INPUT' ||
        n.tagName === 'TEXTAREA' ||
        n.tagName === 'SELECT' ||
        n.isContentEditable
      )
    }
    const onKey = (e: KeyboardEvent): void => {
      const s = kbd.current
      // Finalize: F2, or ⌘/Ctrl+Enter from anywhere.
      if (e.key === 'F2' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
        e.preventDefault()
        void s.finalize()
        return
      }
      // Focus & select the search / scan box.
      if (e.key === 'F3') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      // Focus the amount field (tendered / paid now), when one is shown.
      if (e.key === 'F4') {
        e.preventDefault()
        payInputRef.current?.focus()
        payInputRef.current?.select()
        return
      }
      // Switch payment method: Alt+1 / Alt+2 / Alt+3.
      if (e.altKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault()
        setPaymentMethod(e.key === '1' ? 'cash' : e.key === '2' ? 'card' : 'credit')
        return
      }
      // Toggle the shortcuts help with "?" (when not typing).
      if (e.key === '?' && !editable(e.target)) {
        e.preventDefault()
        setShowShortcuts((v) => !v)
        return
      }
      if (e.key === 'Escape') {
        if (s.showShortcuts) {
          setShowShortcuts(false)
          return
        }
        if (s.completedSale) {
          s.startNewSale()
          return
        }
        if (e.target === searchRef.current) setSearch('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const shortcutRows = [
    { keys: ['F3'], label: t('sale.scSearch') },
    { keys: ['F2'], label: t('sale.scFinalize') },
    { keys: ['Alt', '1 / 2 / 3'], label: t('sale.scPay') },
    { keys: ['F4'], label: t('sale.scTender') },
    { keys: ['?'], label: t('sale.scHelp') },
    { keys: ['Esc'], label: t('sale.scClear') }
  ]

  return (
    <div className="sale">
      <section className="sale-left">
        <input
          ref={searchRef}
          className="search"
          placeholder={t('sale.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onSearchKeyDown}
        />
        {lastScan && (
          <div className={lastScan.matched ? 'scan-readout ok' : 'scan-readout warn'}>
            {t('sale.lastScan')} <code>{lastScan.code}</code>{' '}
            {lastScan.matched ? t('sale.added') : t('sale.noProduct')}
            {!lastScan.matched && (
              <button className="link-btn" onClick={() => requestAddProduct(lastScan.code)}>
                {t('sale.addProduct')}
              </button>
            )}
          </div>
        )}
        {categories.length > 0 && (
          <div className="cat-filter">
            <button
              className={categoryFilter === '' ? 'cat-pill active' : 'cat-pill'}
              onClick={() => setCategoryFilter('')}
            >
              {t('products.allCategories')}
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={categoryFilter === c.id ? 'cat-pill active' : 'cat-pill'}
                onClick={() => setCategoryFilter(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="product-grid">
          {filtered.map((p) => (
            <button
              key={p.id}
              className={'product-chip chip-' + stockLevel(p.stock_qty)}
              onClick={() => addToCart(p)}
            >
              <span className="chip-name">{p.name}</span>
              <span className="chip-price">{money(p.price)}</span>
              <span className={'chip-stock stock-' + stockLevel(p.stock_qty)}>
                {p.stock_qty <= 0 ? t('products.outOfStock') : p.stock_qty}
              </span>
            </button>
          ))}
          {filtered.length === 0 && <div className="empty">{t('sale.noProducts')}</div>}
        </div>
      </section>

      <section className="sale-right">
        <div className="cart">
          {cart.length === 0 && <div className="empty">{t('sale.cartEmpty')}</div>}
          {cart.map((l) => (
            <div key={l.product.id} className="cart-line">
              <div className="cart-line-head">
                <div className="cart-line-info">
                  <span className="cart-line-name">{l.product.name}</span>
                  <span className="cart-line-unit">
                    {money(l.product.price)} × {l.qty}
                    {l.discount > 0 && <em className="cart-line-off">− {money(l.discount)}</em>}
                  </span>
                </div>
                <span className="cart-line-total">
                  {money(l.product.price * l.qty - l.discount)}
                </span>
                <button
                  className="cart-line-remove"
                  aria-label={t('sale.remove')}
                  title={t('sale.remove')}
                  onClick={() => setQty(l.product.id, 0)}
                >
                  ✕
                </button>
              </div>
              <div className="cart-line-ctrls">
                <div className="qty-ctrl">
                  <button onClick={() => setQty(l.product.id, l.qty - 1)}>−</button>
                  <input
                    type="number"
                    value={l.qty}
                    min={0}
                    onChange={(e) => setQty(l.product.id, parseInt(e.target.value) || 0)}
                  />
                  <button onClick={() => setQty(l.product.id, l.qty + 1)}>+</button>
                </div>
                <input
                  className="line-disc"
                  type="number"
                  min={0}
                  disabled={!discountUnlocked}
                  title={discountUnlocked ? undefined : t('elevate.discountLocked')}
                  placeholder={'− ' + t('sale.discount')}
                  value={l.discount || ''}
                  onChange={(e) => setLineDiscount(l.product.id, parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="totals">
          <div className="row">
            <span>{t('sale.subtotal')}</span>
            <span>{money(subtotal)}</span>
          </div>

          <div className="cart-disc-row">
            <span>{t('sale.discount')}</span>
            {discountUnlocked ? (
              <div className="cart-disc-ctrl">
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={cartDiscount}
                  onChange={(e) => setCartDiscount(e.target.value)}
                />
                <button
                  className={cartDiscountType === 'amount' ? 'dt active' : 'dt'}
                  onClick={() => setCartDiscountType('amount')}
                >
                  {currencySymbol()}
                </button>
                <button
                  className={cartDiscountType === 'percent' ? 'dt active' : 'dt'}
                  onClick={() => setCartDiscountType('percent')}
                >
                  %
                </button>
              </div>
            ) : (
              <button className="disc-unlock" onClick={() => setShowDiscountElevate(true)}>
                🔒 {t('elevate.unlock')}
              </button>
            )}
          </div>
          {discountUnlocked && discountPin !== null && (
            <div className="row approver-note">
              <span>✓ {t('elevate.approvedBy', { name: discountApprover })}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="row discount-line">
              <span>{t('sale.discount')}</span>
              <span>− {money(discount)}</span>
            </div>
          )}

          <div className="row">
            <span>{t('sale.tax')}</span>
            <span>{money(tax)}</span>
          </div>
          <div className="row grand">
            <span>{t('sale.total')}</span>
            <span>{money(total)}</span>
          </div>

          <div className="pay-methods">
            <button
              className={paymentMethod === 'cash' ? 'pm active' : 'pm'}
              onClick={() => setPaymentMethod('cash')}
            >
              {t('sale.cash')}
              <kbd className="pm-key">1</kbd>
            </button>
            <button
              className={paymentMethod === 'card' ? 'pm active' : 'pm'}
              onClick={() => setPaymentMethod('card')}
            >
              {t('sale.card')}
              <kbd className="pm-key">2</kbd>
            </button>
            <button
              className={paymentMethod === 'credit' ? 'pm active' : 'pm'}
              onClick={() => setPaymentMethod('credit')}
            >
              {t('sale.credit')}
              <kbd className="pm-key">3</kbd>
            </button>
          </div>

          {paymentMethod === 'credit' && (
            <>
              <select
                className="styled-select credit-customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">{t('sale.pickCustomer')}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                ref={payInputRef}
                className="tender"
                type="number"
                min={0}
                placeholder={t('sale.paidNow')}
                value={creditPaid}
                onChange={(e) => setCreditPaid(e.target.value)}
              />
              <div className="row change">
                <span>{t('sale.onAccount')}</span>
                <span>{money(Math.max(0, total - creditPaidNum))}</span>
              </div>
            </>
          )}

          {paymentMethod === 'cash' && (
            <>
              <input
                ref={payInputRef}
                className="tender"
                type="number"
                placeholder={t('sale.amountTendered')}
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
              />
              <div className="row change">
                <span>{t('sale.change')}</span>
                <span>{money(changeDue > 0 ? changeDue : 0)}</span>
              </div>
            </>
          )}

          <button className="finalize" disabled={cart.length === 0} onClick={finalize}>
            {t('sale.finalize')}
            <kbd className="finalize-key">F2</kbd>
          </button>
          <button
            type="button"
            className="kbd-help-link"
            onClick={() => setShowShortcuts(true)}
          >
            ⌨ {t('sale.shortcutsHint')} <kbd>?</kbd>
          </button>
        </div>
      </section>

      {toast && <div className="toast">{toast}</div>}

      {showDiscountElevate && (
        <ElevateModal
          permission="discount"
          title={t('elevate.titleDiscount')}
          onApproved={(pin, approver) => {
            setDiscountPin(pin)
            setDiscountApprover(approver)
            setShowDiscountElevate(false)
          }}
          onCancel={() => setShowDiscountElevate(false)}
        />
      )}

      {showShortcuts && (
        <div className="modal-backdrop" onClick={() => setShowShortcuts(false)}>
          <div className="modal kbd-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="kbd-sheet-head">
              <h2>⌨ {t('sale.shortcutsTitle')}</h2>
              <button className="kbd-sheet-close" onClick={() => setShowShortcuts(false)}>
                ✕
              </button>
            </div>
            <ul className="kbd-list">
              {shortcutRows.map((r) => (
                <li key={r.label}>
                  <span className="kbd-combo">
                    {r.keys.map((k, i) => (
                      <kbd key={i}>{k}</kbd>
                    ))}
                  </span>
                  <span className="kbd-desc">{r.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {completedSale && (
        <div className="modal-backdrop" onClick={startNewSale}>
          <div className="modal sale-done" onClick={(e) => e.stopPropagation()}>
            <div className="done-head">
              <div className="done-check">✓</div>
              <h2>{t('sale.saleComplete')}</h2>
            </div>

            <div className="done-change">
              <span>{t('sale.change')}</span>
              <span>{money(completedSale.change_due)}</span>
            </div>

            <div className="done-items">
              {completedSale.items.map((it) => (
                <div key={it.id} className="done-item">
                  <span className="done-item-name">
                    {it.name} <span className="done-item-qty">×{it.qty}</span>
                  </span>
                  <span>{money(it.line_total)}</span>
                </div>
              ))}
            </div>

            <div className="done-totals">
              <div className="row">
                <span>{t('sale.subtotal')}</span>
                <span>{money(completedSale.subtotal)}</span>
              </div>
              {completedSale.discount > 0 && (
                <div className="row">
                  <span>{t('sale.discount')}</span>
                  <span>− {money(completedSale.discount)}</span>
                </div>
              )}
              <div className="row">
                <span>{t('sale.tax')}</span>
                <span>{money(completedSale.tax)}</span>
              </div>
              <div className="row grand">
                <span>{t('sale.total')}</span>
                <span>{money(completedSale.total)}</span>
              </div>
              <div className="row">
                <span>{t('sale.' + completedSale.payment_method)}</span>
                <span>{money(completedSale.tendered)}</span>
              </div>
            </div>

            <div className="done-actions">
              <button className="ghost" onClick={() => printSaleReceipt(completedSale)}>
                {t('sale.printReceipt')}
              </button>
              <button className="primary" onClick={startNewSale}>
                {t('sale.newSale')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
