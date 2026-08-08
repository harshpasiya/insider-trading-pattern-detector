'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronLeft, Check, Minus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { SummaryCard, SummaryGrid } from '@/components/SummaryCard'
import { DataTable, type Column } from '@/components/DataTable'
import { RiskPill, Pill } from '@/components/RiskPill'
import { DemoBadge } from '@/components/DemoBadge'
import { getStockHistory, getStockSummary, getStockBacktest } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { DayRecord, StockHistoryResponse, StockSummary, StockBacktestResult } from '@/lib/types'

export default function StockDetailPage() {
  const params = useParams<{ ticker: string }>()
  const ticker = decodeURIComponent(
    Array.isArray(params.ticker) ? params.ticker[0] : params.ticker,
  )

  const [summary, setSummary] = React.useState<StockSummary | null>(null)
  const [history, setHistory] = React.useState<StockHistoryResponse | null>(null)
  const [backtest, setBacktest] = React.useState<StockBacktestResult | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [demo, setDemo] = React.useState(false)

  React.useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([getStockSummary(ticker), getStockHistory(ticker), getStockBacktest(ticker)]).then(
      ([s, h, b]) => {
        if (!active) return
        setSummary(s.data)
        setHistory(h.data)
        setBacktest(b.data)
        setDemo(s.demo || h.demo || b.demo)
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
  }, [ticker])

  const records = history?.records ?? []
  const latestDate = records.at(-1)?.date ?? null

  const columns: Column<DayRecord>[] = [
    {
      key: 'date',
      header: 'Date',
      priority: true,
      render: (r) => <span className="text-foreground">{formatDate(r.date)}</span>,
      sortValue: (r) => r.date,
    },
    {
      key: 'suspicionScore',
      header: 'Score',
      align: 'right',
      priority: true,
      render: (r) => <span className="font-medium tabular-nums">{r.suspicionScore}</span>,
      sortValue: (r) => r.suspicionScore,
    },
    {
      key: 'avr',
      header: 'AVR',
      align: 'right',
      render: (r) => <span className="tabular-nums text-muted">{r.avr.toFixed(2)}×</span>,
      sortValue: (r) => r.avr,
    },
    {
      key: 'car',
      header: 'CAR %',
      align: 'right',
      render: (r) => (
        <span className="tabular-nums text-muted">
          {r.car >= 0 ? '+' : ''}
          {r.car.toFixed(2)}
        </span>
      ),
      sortValue: (r) => r.car,
    },
    {
      key: 'ifAnomaly',
      header: 'IF Anomaly',
      render: (r) =>
        r.ifAnomaly ? (
          <span className="inline-flex items-center gap-1 text-[var(--color-pill-red-text)]">
            <Check size={15} strokeWidth={2} /> Yes
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-faint">
            <Minus size={15} strokeWidth={1.75} /> No
          </span>
        ),
      sortValue: (r) => (r.ifAnomaly ? 1 : 0),
    },
    {
      key: 'eventProximity',
      header: 'Event Proximity',
      align: 'right',
      render: (r) => <span className="tabular-nums text-muted">{r.eventProximity}d</span>,
      sortValue: (r) => r.eventProximity,
    },
  ]

  return (
    <div>
      <Link
        href="/stocks"
        className="mb-3 inline-flex items-center gap-1 text-xs sm:text-sm text-muted transition-colors hover:text-foreground"
      >
        <ChevronLeft size={14} strokeWidth={1.75} />
        Stocks Explorer
      </Link>

      <PageHeader
        title={summary?.ticker ?? ticker}
        subtitle={
          summary ? `${summary.company} · ${summary.sector} · ${summary.exchange}` : '\u00A0'
        }
        badge={
          <span className="flex items-center gap-2">
            {summary ? <RiskPill tier={summary.riskTier} /> : null}
            {!loading && demo ? <DemoBadge /> : null}
          </span>
        }
      />

      <SummaryGrid className="mb-4 sm:mb-6">
        <SummaryCard
          label="Latest Score"
          value={summary?.latestScore ?? 0}
          hint={`as of ${formatDate(latestDate)}`}
          loading={loading}
        />
        <SummaryCard
          label="Peak Score"
          value={summary?.peakScore ?? 0}
          hint="Highest in tracked window"
          loading={loading}
        />
        <SummaryCard
          label="Flagged Days"
          value={summary?.flaggedDays ?? 0}
          hint={
            summary?.lastFlaggedDate
              ? `Last flagged ${formatDate(summary.lastFlaggedDate)}`
              : 'No days above threshold'
          }
          loading={loading}
        />
        <SummaryCard
          label="Avg Forward Return"
          value={`${backtest?.avg_forward_return_pct.toFixed(2) ?? 0}%`}
          hint="Historical average"
          loading={loading}
          accent={
            backtest && backtest.avg_forward_return_pct >= 0 ? (
              <Pill color="green">Positive</Pill>
            ) : (
              <Pill color="red">Negative</Pill>
            )
          }
        />
        <SummaryCard
          label="Win Rate"
          value={`${backtest?.win_rate_pct.toFixed(1) ?? 0}%`}
          hint={`${backtest?.sample_size ?? 0} events`}
          loading={loading}
        />
      </SummaryGrid>

      <div className="mb-2 flex items-center gap-2 sm:mb-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-faint sm:text-sm">Scored history</h2>
        {!loading && <Pill color="gray">{records.length} days</Pill>}
      </div>

      <DataTable
        columns={columns}
        rows={records}
        rowKey={(r) => r.date}
        rowClassName={(r) => (r.flagged ? 'row-flagged' : undefined)}
        loading={loading}
        emptyMessage="No scored history for this ticker yet."
        initialSort={{ key: 'date', dir: 'desc' }}
        pageSize={15}
      />

      <p className="mt-3 text-xs text-faint">
        Rows tinted red crossed the flag threshold (score ≥ 65).
      </p>
    </div>
  )
}