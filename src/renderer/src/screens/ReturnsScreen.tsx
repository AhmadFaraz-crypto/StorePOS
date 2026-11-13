import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, money } from '../api'
import { calcRefund } from '../../../shared/calc'
import ElevateModal from '../components/ElevateModal'
import type { RecentSale, Sale, SaleItemRefundable } from '../../../shared/types'

export default function ReturnsScreen({ canRefund }: { canRefund: boolean }): JSX.Element {
  const { t, i18n } = useTranslation()
  const [recent, setRecent] = useState<RecentSale[]>([])
  const [detail, setDetail] = useState<{ sale: Sale; items: SaleItemRefundable[] } | null>(null)
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [showElevate, setShowElevate] = useState(false)

  const loadRecent = (): void => {
    api.sales.recent(30).then(setRecent)
  }

  useEffect(() => {
    loadRecent()
  }, [])

  const flash = (msg: string): void => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }

  const select = async (id: string): Promise<void> => {
    const d = await api.sales.getForRefund(id)
    setDetail(d)
    setQtys({})
  }

  const setQty = (item: SaleItemRefundable, qty: number): void => {
    const clamped = Math.max(0, Math.min(item.refundable, Math.floor(qty) || 0))
    setQtys((prev) => ({ ...prev, [item.id]: clamped }))
  }

  const preview = useMemo(() => {
    if (!detail) return null
    return calcRefund(
      detail.items.map((it) => ({
        origQty: it.qty,
        lineTotal: it.line_total,
        discount: it.discount,
        refundQty: qtys[it.id] ?? 0
      })),
      detail.sale.tax,
      detail.sale.subtotal - detail.sale.discount
    )
  }, [detail, qtys])

  const refundQtyTotal = Object.values(qtys).reduce((s, n) => s + n, 0)

  // Run the refund. `approvalPin` is a manager PIN when the cashier lacks the right.
  const runRefund = async (approvalPin?: string): Promise<void> => {
    if (!detail || refundQtyTotal === 0) return
    const lines = Object.entries(qtys)
      .filter(([, qty]) => qty > 0)
      .map(([saleItemId, qty]) => ({ saleItemId, qty }))
    try {
      await api.sales.refund({ saleId: detail.sale.id, lines, approvalPin })
    } catch (err) {
      flash(String(err).includes('FORBIDDEN:refund') ? t('elevate.deniedRefund') : t('returns.error'))
      return
    }
    flash(t('returns.processed'))
    setDetail(null)
    setQtys({})
    loadRecent()
  }

  const process = (): void => {
    if (!detail || refundQtyTotal === 0) return
    if (canRefund) void runRefund()
    else setShowElevate(true)
  }

  const fmtDate = (iso: string): string => new Date(iso).toLocaleString(i18n.language)

  return (
    <div className="returns">
      <div className="returns-list">
        <div className="returns-head">{t('returns.recent')}</div>
        <div className="returns-scroll">
          {recent.map((s) => (
            <button
              key={s.id}
              className={detail?.sale.id === s.id ? 'return-row active' : 'return-row'}
              onClick={() => select(s.id)}
            >
              <span className="return-date">{fmtDate(s.created_at)}</span>
              <span className="return-total">{money(s.total)}</span>
            </button>
          ))}
          {recent.length === 0 && <div className="empty">{t('returns.noSales')}</div>}
        </div>
      </div>

      <div className="returns-detail">
        {!detail ? (
          <div className="empty">{t('returns.pick')}</div>
        ) : (
          <>
            <div className="returns-detail-head">{fmtDate(detail.sale.created_at)}</div>
            <div className="returns-items">
              {detail.items.map((it) => (
                <div key={it.id} className="return-item">
                  <span className="return-item-name">{it.name}</span>
                  <span className="return-item-max">{t('returns.max', { count: it.refundable })}</span>
                  <div className="qty-ctrl">
                    <button
                      disabled={(qtys[it.id] ?? 0) <= 0}
                      onClick={() => setQty(it, (qtys[it.id] ?? 0) - 1)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={it.refundable}
                      value={qtys[it.id] ?? 0}
                      onChange={(e) => setQty(it, parseInt(e.target.value) || 0)}
                    />
                    <button
                      disabled={(qtys[it.id] ?? 0) >= it.refundable}
                      onClick={() => setQty(it, (qtys[it.id] ?? 0) + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="returns-summary">
              <div className="row grand">
                <span>{t('returns.refundAmount')}</span>
                <span>{money(preview?.total ?? 0)}</span>
              </div>
              <button className="finalize" disabled={refundQtyTotal === 0} onClick={process}>
                {!canRefund && '🔒 '}
                {t('returns.process')}
              </button>
            </div>
          </>
        )}
      </div>

      {showElevate && (
        <ElevateModal
          permission="refund"
          title={t('elevate.titleRefund')}
          onApproved={(pin) => {
            setShowElevate(false)
            void runRefund(pin)
          }}
          onCancel={() => setShowElevate(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
