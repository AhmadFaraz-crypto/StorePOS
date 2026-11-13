import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, money } from '../api'
import { purchaseTotal } from '../../../shared/calc'
import type { Product, Supplier, PurchaseRow } from '../../../shared/types'

interface Line {
  product: Product
  qty: number
  unitCost: number
}

export default function PurchasesScreen(): JSX.Element {
  const { t, i18n } = useTranslation()
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [recent, setRecent] = useState<PurchaseRow[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [paid, setPaid] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const load = (): void => {
    api.products.list().then(setProducts)
    api.suppliers.list().then(setSuppliers)
    api.purchases.recent(30).then(setRecent)
  }
  useEffect(() => {
    load()
  }, [])

  const flash = (msg: string): void => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }

  const addLine = (productId: string): void => {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    setLines((prev) => {
      if (prev.some((l) => l.product.id === productId)) return prev
      return [...prev, { product, qty: 1, unitCost: product.cost }]
    })
  }
  const setQty = (id: string, qty: number): void =>
    setLines((prev) =>
      prev
        .map((l) => (l.product.id === id ? { ...l, qty: Math.max(0, qty) } : l))
        .filter((l) => l.qty > 0)
    )
  const setCost = (id: string, cost: number): void =>
    setLines((prev) => prev.map((l) => (l.product.id === id ? { ...l, unitCost: Math.max(0, cost) } : l)))
  const removeLine = (id: string): void =>
    setLines((prev) => prev.filter((l) => l.product.id !== id))

  const total = useMemo(
    () => purchaseTotal(lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost }))),
    [lines]
  )
  const paidValue = paid.trim() === '' ? total : parseFloat(paid) || 0
  const outstanding = Math.max(0, total - paidValue)

  const record = async (): Promise<void> => {
    if (lines.length === 0) return
    await api.purchases.create({
      supplier_id: supplierId || null,
      paid: paidValue,
      items: lines.map((l) => ({ product_id: l.product.id, qty: l.qty, unit_cost: l.unitCost }))
    })
    flash(t('purchases.recorded'))
    setLines([])
    setPaid('')
    setSupplierId('')
    load()
  }

  const fmtDate = (iso: string): string => new Date(iso).toLocaleString(i18n.language)

  return (
    <div className="purchases">
      <section className="purchase-form">
        <h2>{t('purchases.newPurchase')}</h2>

        <div className="purchase-top">
          <label>
            {t('purchases.distributor')}
            <select
              className="styled-select"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">{t('purchases.noDistributor')}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('purchases.addProduct')}
            <select
              className="styled-select"
              value=""
              onChange={(e) => {
                if (e.target.value) addLine(e.target.value)
              }}
            >
              <option value="">{t('purchases.addProduct')}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="purchase-lines">
          {lines.length === 0 && <div className="empty">{t('purchases.emptyHint')}</div>}
          {lines.length > 0 && (
            <table className="ledger">
              <thead>
                <tr>
                  <th>{t('products.colName')}</th>
                  <th className="num">{t('purchases.qty')}</th>
                  <th className="num">{t('purchases.unitCost')}</th>
                  <th className="num">{t('sale.total')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.product.id}>
                    <td>{l.product.name}</td>
                    <td className="num">
                      <input
                        className="pl-input"
                        type="number"
                        min={0}
                        value={l.qty}
                        onChange={(e) => setQty(l.product.id, parseInt(e.target.value) || 0)}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="pl-input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.unitCost}
                        onChange={(e) => setCost(l.product.id, parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="num">{money(l.unitCost * l.qty)}</td>
                    <td className="num">
                      <button className="pl-remove" onClick={() => removeLine(l.product.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="purchase-summary">
          <div className="ps-row">
            <span>{t('sale.total')}</span>
            <span className="num">{money(total)}</span>
          </div>
          <label className="ps-paid">
            {t('purchases.paid')}
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder={money(total)}
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
            />
          </label>
          <div className="ps-row ps-out">
            <span>{t('purchases.outstanding')}</span>
            <span className="num">{money(outstanding)}</span>
          </div>
          <button className="finalize" disabled={lines.length === 0} onClick={record}>
            {t('purchases.record')}
          </button>
        </div>
      </section>

      <aside className="purchase-recent">
        <div className="returns-head">{t('purchases.recent')}</div>
        <div className="returns-scroll">
          {recent.map((p) => {
            const owed = p.total - p.paid
            return (
              <div key={p.id} className="purchase-row">
                <div className="pr-top">
                  <span className="pr-supplier">{p.supplier_name ?? t('purchases.noDistributor')}</span>
                  <span className="num">{money(p.total)}</span>
                </div>
                <div className="pr-sub">
                  <span className="pr-date">{fmtDate(p.created_at)}</span>
                  {owed > 0.005 ? (
                    <span className="pr-owed">{t('purchases.owes', { amount: money(owed) })}</span>
                  ) : (
                    <span className="pr-paid">{t('purchases.paidFull')}</span>
                  )}
                </div>
              </div>
            )
          })}
          {recent.length === 0 && <div className="empty">{t('purchases.noPurchases')}</div>}
        </div>
      </aside>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
