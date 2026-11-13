import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, money } from '../api'
import type { RangeReport } from '../../../shared/types'

type Period = 'today' | 'month' | 'range'
const PAGE = 6

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function ReportsScreen(): JSX.Element {
  const { t, i18n } = useTranslation()
  const [period, setPeriod] = useState<Period>('month')
  const [month, setMonth] = useState(currentMonth())
  const today = new Date()
  const [from, setFrom] = useState(isoDay(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [to, setTo] = useState(isoDay(today))
  const [report, setReport] = useState<RangeReport | null>(null)
  const [catPage, setCatPage] = useState(1)
  const [cashPage, setCashPage] = useState(1)
  const [prodPage, setProdPage] = useState(1)

  // Resolve the period to [startIso, endIso), a human label, and the list of days.
  const { startIso, endIso, label, days } = useMemo(() => {
    const d = new Date()
    let s: Date
    let e: Date
    let lab: string
    if (period === 'today') {
      s = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      e = new Date(s.getTime() + 86400000)
      lab = t('reports.todayTitle', { date: s.toLocaleDateString(i18n.language) })
    } else if (period === 'month') {
      const [y, m] = month.split('-').map(Number)
      s = new Date(y, m - 1, 1)
      e = new Date(y, m, 1)
      lab = s.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })
    } else {
      const [fy, fm, fd] = from.split('-').map(Number)
      const [ty, tm, td] = to.split('-').map(Number)
      s = new Date(fy, fm - 1, fd)
      e = new Date(ty, tm - 1, td)
      e.setDate(e.getDate() + 1)
      lab = `${s.toLocaleDateString(i18n.language)} – ${new Date(ty, tm - 1, td).toLocaleDateString(i18n.language)}`
    }
    const list: string[] = []
    const cur = new Date(s)
    while (cur < e && list.length < 400) {
      list.push(isoDay(cur))
      cur.setDate(cur.getDate() + 1)
    }
    return { startIso: s.toISOString(), endIso: e.toISOString(), label: lab, days: list }
  }, [period, month, from, to, i18n.language, t])

  useEffect(() => {
    api.reports.range(startIso, endIso).then(setReport)
    setCatPage(1)
    setCashPage(1)
    setProdPage(1)
  }, [startIso, endIso])

  // Slice a breakdown list for the current page; clamp so deletes/period changes never strand a page.
  const page = <T,>(
    arr: T[],
    current: number
  ): { pages: number; p: number; slice: T[] } => {
    const pages = Math.max(1, Math.ceil(arr.length / PAGE))
    const p = Math.min(current, pages)
    return { pages, p, slice: arr.slice((p - 1) * PAGE, p * PAGE) }
  }

  // One bar per day across the whole period — fill days with no sales as 0.
  const dailySeries = useMemo(() => {
    const map = new Map((report?.daily ?? []).map((d) => [d.date, d]))
    return days.map((day) => {
      const r = map.get(day)
      return { date: day, revenue: r?.revenue ?? 0, profit: r?.profit ?? 0 }
    })
  }, [report, days])

  const marginPct = report ? (report.margin * 100).toFixed(1) + '%' : '—'

  const cat = page(report?.byCategory ?? [], catPage)
  const cash = page(report?.byCashier ?? [], cashPage)
  const prod = page(report?.topProducts ?? [], prodPage)

  return (
    <div className="reports">
      <div className="rep-toolbar">
        <div className="segmented">
          {(['today', 'month', 'range'] as Period[]).map((p) => (
            <button
              key={p}
              className={period === p ? 'seg active' : 'seg'}
              onClick={() => setPeriod(p)}
            >
              {p === 'today'
                ? t('reports.today')
                : p === 'month'
                  ? t('reports.monthly')
                  : t('reports.custom')}
            </button>
          ))}
        </div>
        {period === 'month' && (
          <input
            type="month"
            className="month-picker"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        )}
        {period === 'range' && (
          <div className="range-picker">
            <label>
              {t('reports.from')}
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              {t('reports.to')}
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}
        <div className="rep-period">{label}</div>
      </div>

      {!report ? (
        <div className="empty">{t('reports.loading')}</div>
      ) : (
        <div className="rep-dash">
          <div className="rep-kpis">
            <KPI
              primary
              label={t('reports.grossProfit')}
              value={money(report.grossProfit)}
              sub={`${marginPct} ${t('reports.margin')}`}
            />
            <KPI label={t('reports.netSales')} value={money(report.netSales)} />
            <KPI label={t('reports.grossSales')} value={money(report.grossSales)} />
            <KPI label={t('reports.taxCollected')} value={money(report.taxCollected)} />
            <KPI label={t('reports.cogs')} value={money(report.cogs)} />
            <KPI
              label={t('reports.sales')}
              value={String(report.salesCount)}
              sub={`${report.itemsSold} ${t('reports.itemsSold')}`}
            />
          </div>

          <div className="receivables-row">
            <div className="rp-card rp-in">
              <div className="rp-label">{t('reports.receivable')}</div>
              <div className="rp-value num">{money(report.receivableFromCustomers)}</div>
            </div>
            <div className="rp-card rp-out">
              <div className="rp-label">{t('reports.payable')}</div>
              <div className="rp-value num">{money(report.payableToSuppliers)}</div>
            </div>
          </div>

          {dailySeries.length > 0 && (
            <section className="rep-card chart-card">
              <h3>{t('reports.dailyRevenue')}</h3>
              <DailyChart data={dailySeries} />
            </section>
          )}

          <div className="rep-grid">
            <ReportTable
              title={t('reports.topProducts')}
              head={[
                t('reports.product'),
                t('reports.qty'),
                t('reports.revenue'),
                t('reports.profit')
              ]}
              empty={t('reports.noSalesMonth')}
              rows={prod.slice.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td className="col-num">{p.qty}</td>
                  <td className="col-num">{money(p.revenue)}</td>
                  <td className="col-num profit">{money(p.profit)}</td>
                </tr>
              ))}
              count={report.topProducts.length}
              pager={prod}
              onPage={setProdPage}
              pageInfo={t('products.pageInfo', { current: prod.p, total: prod.pages })}
              prev={t('products.prev')}
              next={t('products.next')}
            />

            <ReportTable
              title={t('reports.byCategory')}
              head={[t('products.category'), t('reports.revenue'), t('reports.profit')]}
              empty={t('reports.noSalesMonth')}
              rows={cat.slice.map((c, i) => (
                <tr key={i}>
                  <td>{c.name ?? t('products.uncategorized')}</td>
                  <td className="col-num">{money(c.revenue)}</td>
                  <td className="col-num profit">{money(c.profit)}</td>
                </tr>
              ))}
              count={report.byCategory.length}
              pager={cat}
              onPage={setCatPage}
              pageInfo={t('products.pageInfo', { current: cat.p, total: cat.pages })}
              prev={t('products.prev')}
              next={t('products.next')}
            />

            <ReportTable
              title={t('reports.byCashier')}
              head={[t('reports.cashier'), t('reports.count'), t('reports.totalCol')]}
              empty={t('reports.noSalesMonth')}
              rows={cash.slice.map((c, i) => (
                <tr key={i}>
                  <td>{c.name ?? t('reports.unassigned')}</td>
                  <td className="col-num">{c.count}</td>
                  <td className="col-num">{money(c.total)}</td>
                </tr>
              ))}
              count={report.byCashier.length}
              pager={cash}
              onPage={setCashPage}
              pageInfo={t('products.pageInfo', { current: cash.p, total: cash.pages })}
              prev={t('products.prev')}
              next={t('products.next')}
            />

            <ReportTable
              title={t('reports.byMethod')}
              head={[t('reports.method'), t('reports.count'), t('reports.totalCol')]}
              empty={t('reports.noSales')}
              rows={report.byMethod.map((r) => (
                <tr key={r.payment_method}>
                  <td>{t('sale.' + r.payment_method)}</td>
                  <td className="col-num">{r.count}</td>
                  <td className="col-num">{money(r.total)}</td>
                </tr>
              ))}
              count={report.byMethod.length}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function KPI({
  label,
  value,
  sub,
  primary
}: {
  label: string
  value: string
  sub?: string
  primary?: boolean
}): JSX.Element {
  return (
    <div className={primary ? 'kpi primary' : 'kpi'}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  )
}

interface PagerInfo {
  pages: number
  p: number
}

function ReportTable({
  title,
  head,
  rows,
  empty,
  count,
  pager,
  onPage,
  pageInfo,
  prev,
  next
}: {
  title: string
  head: string[]
  rows: React.ReactNode[]
  empty: string
  count: number
  pager?: PagerInfo
  onPage?: (n: number) => void
  pageInfo?: string
  prev?: string
  next?: string
}): JSX.Element {
  return (
    <section className="rep-card">
      <h3>{title}</h3>
      {count === 0 ? (
        <div className="empty">{empty}</div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                {head.map((h, i) => (
                  <th key={i} className={i === 0 ? '' : 'col-num'}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
          {pager && onPage && pager.pages > 1 && (
            <div className="table-pager">
              <button className="ghost btn-sm" disabled={pager.p <= 1} onClick={() => onPage(pager.p - 1)}>
                {prev}
              </button>
              <span>{pageInfo}</span>
              <button
                className="ghost btn-sm"
                disabled={pager.p >= pager.pages}
                onClick={() => onPage(pager.p + 1)}
              >
                {next}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function DailyChart({ data }: { data: { date: string; revenue: number; profit: number }[] }): JSX.Element {
  const { t, i18n } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const H = 190
  const padT = 16
  const padB = 6
  const padX = 4
  const n = data.length
  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.profit)))
  const xFor = (i: number): number => (n > 1 ? padX + (i / (n - 1)) * (w - 2 * padX) : w / 2)
  const yFor = (v: number): number => padT + (1 - v / max) * (H - padT - padB)
  const line = (key: 'revenue' | 'profit'): string =>
    data.map((d, i) => `${xFor(i)},${yFor(d[key])}`).join(' ')
  const area =
    `M ${xFor(0)},${H - padB} ` +
    data.map((d, i) => `L ${xFor(i)},${yFor(d.revenue)}`).join(' ') +
    ` L ${xFor(n - 1)},${H - padB} Z`

  const fmt = (iso: string): string =>
    new Date(iso + 'T00:00:00').toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })

  const onMove = (e: React.MouseEvent): void => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const fx = e.clientX - rect.left
    const idx = n > 1 ? Math.round(((fx - padX) / (w - 2 * padX)) * (n - 1)) : 0
    setHover(Math.max(0, Math.min(n - 1, idx)))
  }
  const h = hover !== null ? data[hover] : null

  return (
    <div className="chart">
      <div className="chart-legend">
        <span className="lg lg-rev">{t('reports.revenue')}</span>
        <span className="lg lg-pro">{t('reports.profit')}</span>
        <span className="chart-max">{money(max)}</span>
      </div>
      <div className="linechart" ref={ref}>
        <svg width={w} height={H} className="line-svg">
          <defs>
            <linearGradient id="revArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              className="line-grid"
              x1={0}
              x2={w}
              y1={padT + f * (H - padT - padB)}
              y2={padT + f * (H - padT - padB)}
            />
          ))}
          <path d={area} fill="url(#revArea)" />
          <polyline className="line-rev" points={line('revenue')} />
          <polyline className="line-pro" points={line('profit')} />
          {h && (
            <g>
              <line className="line-cross" x1={xFor(hover!)} x2={xFor(hover!)} y1={padT} y2={H - padB} />
              <circle className="dot-rev" cx={xFor(hover!)} cy={yFor(h.revenue)} r={4} />
              <circle className="dot-pro" cx={xFor(hover!)} cy={yFor(h.profit)} r={4} />
            </g>
          )}
          <rect
            x={0}
            y={0}
            width={w}
            height={H}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
        {h && (
          <div
            className="chart-tip"
            style={{ left: Math.max(60, Math.min(w - 60, xFor(hover!))), top: yFor(h.revenue) }}
          >
            <div className="chart-tip-date">{fmt(h.date)}</div>
            <div className="chart-tip-rev">{money(h.revenue)}</div>
            <div className="chart-tip-profit">
              {money(h.profit)} · {t('reports.profit')}
            </div>
          </div>
        )}
      </div>
      <div className="chart-axis">
        <span>{fmt(data[0].date)}</span>
        <span>{fmt(data[data.length - 1].date)}</span>
      </div>
    </div>
  )
}


