import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, money } from '../api'
import type { Shift, ShiftReport } from '../../../shared/types'

export default function ShiftModal({
  userId,
  onClose
}: {
  userId: string | null
  onClose: () => void
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const [shift, setShift] = useState<Shift | null | undefined>(undefined)
  const [float, setFloat] = useState('')
  const [counted, setCounted] = useState('')
  const [report, setReport] = useState<ShiftReport | null>(null)

  useEffect(() => {
    api.shifts.current().then(setShift)
  }, [])

  const open = async (): Promise<void> => {
    const s = await api.shifts.open({ userId, openingFloat: parseFloat(float) || 0 })
    setShift(s)
  }
  const close = async (): Promise<void> => {
    if (!shift) return
    const r = await api.shifts.close({
      shiftId: shift.id,
      countedCash: parseFloat(counted) || 0,
      userId
    })
    setReport(r)
    setShift(null)
  }

  const fmt = (iso: string): string => new Date(iso).toLocaleString(i18n.language)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal shift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{report ? t('shift.zReport') : t('shift.button')}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {report ? (
          <ZReport report={report} fmt={fmt} onClose={onClose} />
        ) : shift === undefined ? (
          <div className="empty">…</div>
        ) : shift ? (
          <>
            <div className="shift-meta">
              {t('shift.openedAt')}: {fmt(shift.opened_at)}
            </div>
            <div className="shift-meta">
              {t('shift.openingFloat')}: {money(shift.opening_float)}
            </div>
            <label>
              {t('shift.countedCash')}
              <input
                autoFocus
                type="number"
                min={0}
                step="0.01"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
            </label>
            <button className="primary" onClick={close}>
              {t('shift.close')}
            </button>
          </>
        ) : (
          <>
            <p className="shift-prompt">{t('shift.openPrompt')}</p>
            <label>
              {t('shift.openingFloat')}
              <input
                autoFocus
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                value={float}
                onChange={(e) => setFloat(e.target.value)}
              />
            </label>
            <button className="primary" onClick={open}>
              {t('shift.open')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ZReport({
  report,
  fmt,
  onClose
}: {
  report: ShiftReport
  fmt: (iso: string) => string
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const over = report.overShort
  const overClass = over < -0.005 ? 'z-short' : over > 0.005 ? 'z-over' : ''
  return (
    <div className="zreport">
      <div className="z-grid">
        <ZRow label={t('shift.openingFloat')} value={money(report.openingFloat)} />
        <ZRow label={t('shift.expected')} value={money(report.cashExpected)} />
        <ZRow label={t('shift.countedCash')} value={money(report.countedCash)} />
        <div className={'z-row z-overshort ' + overClass}>
          <span>{t('shift.overShort')}</span>
          <span className="num">
            {over >= 0 ? '+ ' : '− '}
            {money(Math.abs(over))}
          </span>
        </div>
      </div>

      <div className="z-grid z-secondary">
        <ZRow label={t('reports.sales')} value={String(report.salesCount)} />
        <ZRow label={t('sale.total')} value={money(report.total)} />
      </div>

      <h3 className="z-section">{t('reports.byMethod')}</h3>
      <table className="ledger">
        <thead>
          <tr>
            <th>{t('reports.method')}</th>
            <th className="num">{t('reports.count')}</th>
            <th className="num">{t('reports.totalCol')}</th>
          </tr>
        </thead>
        <tbody>
          {report.byMethod.map((r) => (
            <tr key={r.payment_method}>
              <td>{t('sale.' + r.payment_method)}</td>
              <td className="num">{r.count}</td>
              <td className="num">{money(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="shift-meta">
        {t('shift.openedAt')}: {fmt(report.openedAt)}
        {report.openedByName ? ' · ' + report.openedByName : ''}
      </div>
      <div className="shift-meta">
        {t('shift.closedAt')}: {fmt(report.closedAt)}
        {report.closedByName ? ' · ' + report.closedByName : ''}
      </div>
      <button className="primary z-done" onClick={onClose}>
        {t('shift.done')}
      </button>
    </div>
  )
}

function ZRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="z-row">
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  )
}
