import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Papa from 'papaparse'
import { api, money, currencySymbol } from '../api'
import { useScanner, useScanHandler } from '../ScannerContext'
import { stockLevel } from '../../../shared/stock'
import type { Category, Product, ProductInput, TaxRate } from '../../../shared/types'

const EMPTY: ProductInput = {
  name: '',
  barcode: '',
  price: 0,
  cost: 0,
  tax_rate: 0,
  tax_rate_id: null,
  stock_qty: 0,
  category_id: null
}

const PAGE_SIZE = 20

interface ParsedRow {
  row: ProductInput
  error?: string // translation key suffix under "products"
  raw: number // 1-based source line for messages
}

export default function ProductsScreen(): JSX.Element {
  const { t } = useTranslation()
  const { pendingBarcode, consumePendingBarcode } = useScanner()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  const [form, setForm] = useState<ProductInput>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('') // '' = all, 'none' = uncategorized
  const [page, setPage] = useState(1)
  const [scanBarcode, setScanBarcode] = useState<string | null>(null)
  const [importRows, setImportRows] = useState<ParsedRow[] | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = (): void => {
    api.products.list().then(setProducts)
  }

  useEffect(() => {
    load()
    api.categories.list().then(setCategories)
    api.taxRates.list().then(setTaxRates)
  }, [])

  const startNewWithBarcode = (barcode: string): void => {
    setEditingId(null)
    setForm({ ...EMPTY, barcode })
    setScanBarcode(barcode)
    setTimeout(() => nameRef.current?.focus(), 0)
  }

  // Phone scans on this tab start a fresh product with the barcode pre-filled.
  useScanHandler((code) => startNewWithBarcode(code.trim()))

  // Barcode handed over from the Sale tab's "Add product" shortcut.
  useEffect(() => {
    if (pendingBarcode) {
      startNewWithBarcode(pendingBarcode)
      consumePendingBarcode()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBarcode])

  const edit = (p: Product): void => {
    setScanBarcode(null)
    setEditingId(p.id)
    setForm({
      id: p.id,
      name: p.name,
      barcode: p.barcode ?? '',
      price: p.price,
      cost: p.cost,
      tax_rate: p.tax_rate,
      tax_rate_id: p.tax_rate_id,
      stock_qty: p.stock_qty,
      category_id: p.category_id
    })
  }

  const reset = (): void => {
    setEditingId(null)
    setForm(EMPTY)
    setScanBarcode(null)
  }

  const save = async (): Promise<void> => {
    if (!form.name.trim()) return
    await api.products.upsert({
      ...form,
      barcode: form.barcode?.trim() ? form.barcode.trim() : null
    })
    reset()
    load()
  }

  const remove = async (id: string): Promise<void> => {
    await api.products.delete(id)
    if (editingId === id) reset()
    load()
  }

  const flash = (msg: string): void => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3000)
  }

  // ---- CSV template & import ----

  const downloadTemplate = (): void => {
    const csv = 'name,barcode,price,cost,tax,stock\nExample Biscuit,8964000123456,50,38,0,100\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'storepos-products-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const num = (v: unknown): number => {
    const n = parseFloat(String(v ?? '').trim())
    return Number.isFinite(n) ? n : 0
  }

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase()
    })
    const rows: ParsedRow[] = parsed.data.map((r, i) => {
      const name = (r['name'] ?? '').trim()
      const barcodeRaw = (r['barcode'] ?? '').trim()
      const taxPct = num(r['tax'] ?? r['tax %'] ?? r['tax_rate'])
      const row: ProductInput = {
        name,
        barcode: barcodeRaw || null,
        price: num(r['price']),
        cost: num(r['cost']),
        tax_rate: taxPct / 100,
        stock_qty: num(r['stock'] ?? r['stock_qty'] ?? r['qty'] ?? r['quantity'])
      }
      return { row, raw: i + 2, error: name ? undefined : 'missingName' }
    })
    if (rows.length === 0) {
      flash(t('products.toastNoRows'))
      return
    }
    setImportRows(rows)
  }

  const confirmImport = async (): Promise<void> => {
    if (!importRows) return
    const valid = importRows.filter((r) => !r.error).map((r) => r.row)
    const result = await api.products.bulkUpsert(valid)
    setImportRows(null)
    load()
    flash(t('products.toastImported', { added: result.added, updated: result.updated }))
  }

  // tax_rate is stored as a fraction; the form edits it as a percentage.
  const taxPercent = Math.round(form.tax_rate * 10000) / 100

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (categoryFilter === 'none' && p.category_id) return false
      if (categoryFilter && categoryFilter !== 'none' && p.category_id !== categoryFilter)
        return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q)
    })
  }, [products, search, categoryFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const onSearch = (value: string): void => {
    setSearch(value)
    setPage(1)
  }

  const validCount = importRows ? importRows.filter((r) => !r.error).length : 0
  const invalidCount = importRows ? importRows.length - validCount : 0

  return (
    <div className="products">
      <div className="product-form">
        <h2>{editingId ? t('products.editProduct') : t('products.newProduct')}</h2>
        {scanBarcode && (
          <div className="scan-note">{t('products.scanNote', { code: scanBarcode })}</div>
        )}
        <label>
          {t('products.name')}
          <input
            ref={nameRef}
            placeholder={t('products.namePlaceholder')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          {t('products.barcode')}
          <input
            placeholder={t('products.barcodePlaceholder')}
            value={form.barcode ?? ''}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          />
        </label>
        <label>
          {t('products.category')}
          <select
            className="styled-select"
            value={form.category_id ?? ''}
            onChange={(e) => setForm({ ...form, category_id: e.target.value || null })}
          >
            <option value="">{t('products.noCategory')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>
            {t('products.price', { sym: currencySymbol() })}
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
            />
          </label>
          <label>
            {t('products.cost', { sym: currencySymbol() })}
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            {t('products.taxPercent')}
            {taxRates.length > 0 ? (
              <select
                className="styled-select"
                value={form.tax_rate_id ?? 'custom'}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === 'custom') {
                    setForm({ ...form, tax_rate_id: null })
                  } else {
                    const tr = taxRates.find((r) => r.id === val)
                    setForm({ ...form, tax_rate_id: val, tax_rate: tr ? tr.rate : form.tax_rate })
                  }
                }}
              >
                {taxRates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({(r.rate * 100).toFixed(r.rate * 100 === Math.round(r.rate * 100) ? 0 : 2)}%)
                  </option>
                ))}
                <option value="custom">{t('products.customTax')}</option>
              </select>
            ) : null}
            {(!form.tax_rate_id || taxRates.length === 0) && (
              <input
                type="number"
                min={0}
                step="0.1"
                value={taxPercent}
                onChange={(e) =>
                  setForm({ ...form, tax_rate: (parseFloat(e.target.value) || 0) / 100 })
                }
              />
            )}
          </label>
          <label>
            {t('products.stock')}
            <input
              type="number"
              min={0}
              value={form.stock_qty}
              onChange={(e) => setForm({ ...form, stock_qty: parseFloat(e.target.value) || 0 })}
            />
          </label>
        </div>
        <div className="form-actions">
          <button className="primary" onClick={save}>
            {editingId ? t('products.save') : t('products.add')}
          </button>
          {(editingId || form.name || form.barcode) && (
            <button className="ghost" onClick={reset}>
              {t('products.clear')}
            </button>
          )}
        </div>

        <div className="import-box">
          <div className="import-title">{t('products.bulkImport')}</div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={onFilePicked}
          />
          <div className="import-actions">
            <button className="ghost" onClick={() => fileRef.current?.click()}>
              {t('products.importCsv')}
            </button>
            <button className="link-btn" onClick={downloadTemplate}>
              {t('products.downloadTemplate')}
            </button>
          </div>
        </div>
      </div>

      <div className="product-list">
        <div className="list-toolbar">
          <input
            className="list-search"
            placeholder={t('products.searchPlaceholder')}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          <select
            className="styled-select"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="">{t('products.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="none">{t('products.uncategorized')}</option>
          </select>
          <span className="list-count">{t('products.count', { count: filtered.length })}</span>
        </div>

        <div className="list-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>{t('products.colName')}</th>
                <th>{t('products.colBarcode')}</th>
                <th className="num">{t('products.colPrice')}</th>
                <th className="num">{t('products.colStock')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.barcode ?? '—'}</td>
                  <td className="num">{money(p.price)}</td>
                  <td className={'num stock-cell stock-' + stockLevel(p.stock_qty)}>
                    {p.stock_qty <= 0 ? t('products.outOfStock') : p.stock_qty}
                  </td>
                  <td className="row-actions">
                    <button onClick={() => edit(p)}>{t('products.edit')}</button>
                    <button className="danger" onClick={() => remove(p.id)}>
                      {t('products.delete')}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    {search ? t('products.noMatch') : t('products.none')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="ghost"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              {t('products.prev')}
            </button>
            <span className="page-info">
              {t('products.pageInfo', { current: currentPage, total: totalPages })}
            </span>
            <button
              className="ghost"
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              {t('products.next')}
            </button>
          </div>
        )}
      </div>

      {importRows && (
        <div className="modal-backdrop" onClick={() => setImportRows(null)}>
          <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{t('products.importPreview')}</h2>
              <button className="modal-close" onClick={() => setImportRows(null)}>
                ✕
              </button>
            </div>
            <p className="import-summary">
              {t('products.importReady', { count: validCount })}
              {invalidCount > 0 && (
                <span className="import-warn">
                  {t('products.importSkipped', { count: invalidCount })}
                </span>
              )}
            </p>
            <div className="import-preview">
              <table>
                <thead>
                  <tr>
                    <th>{t('products.colName')}</th>
                    <th>{t('products.colBarcode')}</th>
                    <th>{t('products.colPrice')}</th>
                    <th>{t('products.colStock')}</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.slice(0, 50).map((r, i) => (
                    <tr key={i} className={r.error ? 'bad-row' : ''}>
                      <td>
                        {r.error ? (
                          <em>
                            {t('products.rowError', {
                              line: r.raw,
                              error: t('products.missingName')
                            })}
                          </em>
                        ) : (
                          r.row.name
                        )}
                      </td>
                      <td>{r.row.barcode ?? '—'}</td>
                      <td>{money(r.row.price)}</td>
                      <td>{r.row.stock_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importRows.length > 50 && (
                <div className="import-more">
                  {t('products.importMore', { count: importRows.length - 50 })}
                </div>
              )}
            </div>
            <div className="form-actions">
              <button className="primary" disabled={validCount === 0} onClick={confirmImport}>
                {t('products.importButton', { count: validCount })}
              </button>
              <button className="ghost" onClick={() => setImportRows(null)}>
                {t('products.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
