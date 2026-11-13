import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, money } from '../api'
import { useScanner } from '../ScannerContext'
import { printStatement } from '../receipt'
import type { Customer, CustomerLedgerEntry, SaleItem, Sale } from '../../../shared/types'

export default function CustomersScreen(): JSX.Element {
  const { t, i18n } = useTranslation()
  const { startCreditSale } = useScanner()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ledger, setLedger] = useState<CustomerLedgerEntry[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<SaleItem[]>([])
  const [expandedSale, setExpandedSale] = useState<Sale | null>(null)
  const [amount, setAmount] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return c.name.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q)
  })

  const loadCustomers = (): void => {
    api.customers.list().then(setCustomers)
  }
  useEffect(() => {
    loadCustomers()
  }, [])

  const selected = customers.find((c) => c.id === selectedId) ?? null

  const select = (id: string): void => {
    setSelectedId(id)
    setAmount('')
    setExpandedId(null)
    api.customers.ledger(id, 50).then(setLedger)
  }

  // Expand a purchase row to reveal its full item list.
  const toggleExpand = async (saleId: string): Promise<void> => {
    if (expandedId === saleId) {
      setExpandedId(null)
      return
    }
    const res = await api.sales.getForRefund(saleId)
    setExpandedItems(res?.items ?? [])
    setExpandedSale(res?.sale ?? null)
    setExpandedId(saleId)
  }

  const flash = (msg: string): void => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }

  const addCustomer = async (): Promise<void> => {
    if (!newName.trim()) return
    await api.customers.upsert({ name: newName.trim(), phone: newPhone.trim() || null })
    setNewName('')
    setNewPhone('')
    loadCustomers()
  }

  const removeCustomer = async (id: string): Promise<void> => {
    await api.customers.delete(id)
    if (selectedId === id) setSelectedId(null)
    loadCustomers()
  }

  const recordPayment = async (): Promise<void> => {
    const amt = parseFloat(amount) || 0
    if (!selected || amt <= 0) return
    await api.customers.recordPayment(selected.id, amt)
    setAmount('')
    flash(t('customers.paymentRecorded'))
    loadCustomers()
    api.customers.ledger(selected.id, 50).then(setLedger)
  }

  const fmtDate = (iso: string): string => new Date(iso).toLocaleString(i18n.language)

  const onPrintStatement = async (): Promise<void> => {
    if (!selected) return
    const s = await api.settings.get()
    void printStatement({
      storeName: s.storeName,
      address: s.address,
      phone: s.phone,
      customerName: selected.name,
      customerPhone: selected.phone ?? '',
      dateText: new Date().toLocaleString(i18n.language),
      title: t('customers.statementTitle'),
      balanceLabel: selected.balance < -0.005 ? t('customers.advance') : t('customers.balance'),
      balance: Math.abs(selected.balance),
      entries: ledger.map((e) => ({
        label: e.type === 'payment' ? t('customers.paymentLabel') : t('customers.saleLabel'),
        detail: e.detail,
        amount: e.amount,
        sign: e.type === 'payment' ? '-' : '+',
        dateText: fmtDate(e.created_at)
      }))
    })
  }

  return (
    <div className="customers">
      <div className="cust-list">
        <div className="returns-head">{t('app.customers')}</div>
        <input
          className="cust-search"
          placeholder={t('customers.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="returns-scroll">
          {filtered.map((c) => (
            <button
              key={c.id}
              className={selectedId === c.id ? 'cust-row active' : 'cust-row'}
              onClick={() => select(c.id)}
            >
              <span className="cust-name">{c.name}</span>
              <span
                className={
                  c.balance > 0.005
                    ? 'num cust-owes'
                    : c.balance < -0.005
                      ? 'num cust-credit'
                      : 'num cust-settled'
                }
              >
                {c.balance > 0.005
                  ? money(c.balance)
                  : c.balance < -0.005
                    ? t('customers.advance')
                    : t('customers.settled')}
              </span>
            </button>
          ))}
          {filtered.length === 0 && <div className="empty">{t('customers.none')}</div>}
        </div>
        <div className="cust-add">
          <input
            placeholder={t('customers.namePlaceholder')}
            maxLength={60}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="cust-add-row">
            <input
              placeholder={t('settings.phone') + ' (' + t('settings.optional') + ')'}
              maxLength={40}
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
            />
            <button className="primary" onClick={addCustomer}>
              {t('settings.addCategory')}
            </button>
          </div>
        </div>
      </div>

      <div className="cust-detail">
        {!selected ? (
          <div className="empty">{t('customers.select')}</div>
        ) : (
          <>
            <div className="cust-detail-head">
              <div>
                <div className="cust-detail-name">{selected.name}</div>
                {selected.phone && <div className="cust-detail-phone">{selected.phone}</div>}
              </div>
              <div className="cust-head-actions">
                <button className="ghost" onClick={onPrintStatement}>
                  {t('customers.printStatement')}
                </button>
                <button className="danger-link" onClick={() => removeCustomer(selected.id)}>
                  {t('products.delete')}
                </button>
              </div>
            </div>

            <div className={selected.balance < -0.005 ? 'cust-balance is-credit' : 'cust-balance'}>
              <span>
                {selected.balance < -0.005 ? t('customers.advance') : t('customers.balance')}
              </span>
              <span className="num">{money(Math.abs(selected.balance))}</span>
            </div>

            <button className="primary cust-newsale" onClick={() => startCreditSale(selected.id)}>
              + {t('customers.newSale')}
            </button>

            <div className="cust-pay">
              <input
                type="number"
                min={0}
                placeholder={t('customers.amount')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {selected.balance > 0.005 && (
                <button
                  className="ghost"
                  onClick={() => setAmount(String(Math.max(0, selected.balance)))}
                >
                  {t('customers.payFull')}
                </button>
              )}
              <button
                className="primary"
                disabled={!(parseFloat(amount) > 0)}
                onClick={recordPayment}
              >
                {t('customers.recordPayment')}
              </button>
            </div>

            <h3 className="cust-history-title">{t('customers.history')}</h3>
            <div className="cust-history">
              {ledger.map((e) => (
                <div key={e.id}>
                  <div
                    className={e.type === 'sale' ? 'cust-entry clickable' : 'cust-entry'}
                    onClick={e.type === 'sale' ? () => toggleExpand(e.id) : undefined}
                  >
                    <span className={e.type === 'payment' ? 'ce-type pay' : 'ce-type buy'}>
                      {e.type === 'payment'
                        ? t('customers.paymentLabel')
                        : t('customers.saleLabel')}
                    </span>
                    <div className="ce-mid">
                      <span className="ce-date">{fmtDate(e.created_at)}</span>
                      {e.detail && <span className="ce-detail">{e.detail}</span>}
                    </div>
                    <span className="num">
                      {e.type === 'payment' ? '− ' : '+ '}
                      {money(e.amount)}
                      {e.type === 'sale' && (
                        <span className="ce-caret">{expandedId === e.id ? ' ▾' : ' ▸'}</span>
                      )}
                    </span>
                  </div>
                  {expandedId === e.id && (
                    <div className="ce-items">
                      {expandedItems.map((it) => (
                        <div key={it.id} className="ce-item">
                          <span>
                            {it.name} <span className="ce-item-qty">×{it.qty}</span>
                          </span>
                          <span className="num">{money(it.line_total - it.discount)}</span>
                        </div>
                      ))}
                      {expandedSale && (
                        <div className="ce-item ce-item-total">
                          <span>{t('sale.total')}</span>
                          <span className="num">{money(expandedSale.total)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {ledger.length === 0 && <div className="empty">{t('customers.noHistory')}</div>}
            </div>
          </>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
