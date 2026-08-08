'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search, Download } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { DataTable, type Column } from '@/components/DataTable'
import { RiskPill, Pill } from '@/components/RiskPill'
import { DemoBadge } from '@/components/DemoBadge'
import { FilterChips } from '@/components/FilterChips'
import { getStocks, getStockHistory, getFlags } from '@/lib/api'
import { formatDate, tierFromScore, exportToCSV } from '@/lib/utils'
import type { HistoricalEvent } from '@/lib/types'

const RISK_TIERS = ['All', 'Critical', 'High', 'Medium', 'Low']
const DATE_RANGES = ['Any time', 'Last 30 days', 'Last 60 days', 'Last 90 days']

function withinDays(dateStr: string, days: number): boolean {
  const cutoff = new Date('2026-06-24')
  cutoff.setDate(cutoff.getDate() - days)
  return new Date(dateStr) >= cutoff
}

export default function HistoricalLogPage() {
  const router = useRouter()
  const [events, setEvents] = React.useState<HistoricalEvent[]>([])
  const [loading, setLoading] = React.useState(true)
  const [demo, setDemo] = React.useState(false)

  const [search, setSearch] = React.useState('')
  const [tier, setTier] = React.useState('All')
  const [dateRange, setDateRange] = React.useState('Any time')

  React.useEffect(() => {
    let active = true
    // NOTE: This page aggregates cross-stock flagged history client-side by
    // calling getStockHistory() for every ticker that /flags reports has at
    // least one flagged day (see below), and collecting the days that
    // crossed the flag threshold. There is no single backend endpoint that
    // returns cross-stock history yet — when Person A adds a dedicated
    // endpoint (e.g. GET /history), replace this fan-out with a single call.
    async function load() {
      const [stocksRes, flagsRes] = await Promise.all([getStocks(), getFlags()])
      let anyDemo = stocksRes.demo || flagsRes.demo

      // Real /stock/{ticker} returns a stock's ENTIRE multi-year history
      // (thousands of rows) — fanning that out across all tracked tickers
      // just to find the handful of flagged days is far too much data to
      // pull for a real universe. /flags already reports each ticker's
      // flagged_days count, so we only fetch full history for tickers that
      // actually have at least one flagged day; the rest contribute nothing
      // to this log and are skipped entirely.
      const flaggedDaysByTicker = new Map(flagsRes.data.map((f) => [f.ticker, f.flaggedDays]))
      const tickersWithFlags = stocksRes.data.filter(
        (s) => (flaggedDaysByTicker.get(s.ticker) ?? 0) > 0,
      )

      const histories = await Promise.all(
        tickersWithFlags.map((s) => getStockHistory(s.ticker)),
      )
      const collected: HistoricalEvent[] = []
      histories.forEach((h, idx) => {
        if (h.demo) anyDemo = true
        const company = tickersWithFlags[idx].company
        h.data.records
          .filter((r) => r.flagged)
          .forEach((r) => {
            collected.push({
              date: r.date,
              ticker: h.data.ticker,
              company,
              score: r.suspicionScore,
              riskTier: tierFromScore(r.suspicionScore),
              signalType: r.signalType ?? 'Composite Signal',
            })
          })
      })
      collected.sort((a, b) => b.date.localeCompare(a.date))
      if (!active) return
      setEvents(collected)
      setDemo(anyDemo)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter((e) => {
      if (q && !e.ticker.toLowerCase().includes(q) && !e.company.toLowerCase().includes(q))
        return false
      if (tier !== 'All' && e.riskTier !== tier) return false
      if (dateRange === 'Last 30 days' && !withinDays(e.date, 30)) return false
      if (dateRange === 'Last 60 days' && !withinDays(e.date, 60)) return false
      if (dateRange === 'Last 90 days' && !withinDays(e.date, 90)) return false
      return true
    })
  }, [events, search, tier, dateRange])

  const columns: Column<HistoricalEvent>[] = [
    {
      key: 'date',
      header: 'Date',
      priority: true,
      render: (e) => <span className="text-foreground">{formatDate(e.date)}</span>,
      sortValue: (e) => e.date,
    },
    {
      key: 'ticker',
      header: 'Ticker',
      priority: true,
      render: (e) => <span className="font-medium text-foreground">{e.ticker}</span>,
      sortValue: (e) => e.ticker,
    },
    {
      key: 'company',
      header: 'Company',
      render: (e) => <span className="text-muted">{e.company}</span>,
      sortValue: (e) => e.company,
    },
    {
      key: 'score',
      header: 'Score',
      align: 'right',
      priority: true,
      render: (e) => <span className="font-medium tabular-nums">{e.score}</span>,
      sortValue: (e) => e.score,
    },
    {
      key: 'riskTier',
      header: 'Risk',
      render: (e) => <RiskPill tier={e.riskTier} />,
      sortValue: (e) => e.score,
    },
    {
      key: 'signalType',
      header: 'Signal Type',
      render: (e) => <Pill color="blue">{e.signalType}</Pill>,
      sortValue: (e) => e.signalType,
    },
  ]

  function handleExport() {
    exportToCSV(
      filtered.map((e) => ({
        Date: e.date,
        Ticker: e.ticker,
        Company: e.company,
        Score: e.score,
        RiskTier: e.riskTier,
        SignalType: e.signalType,
      })),
      'tradewatch-historical-log.csv',
    )
  }

  return (
    <div>
      <PageHeader
        title="Historical Log"
        subtitle="Every flagged trading day, aggregated across all monitored stocks."
        badge={!loading && demo ? <DemoBadge /> : undefined}
        action={
          <button
            type="button"
            onClick={handleExport}
            disabled={!filtered.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:bg-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={15} strokeWidth={1.75} />
            Export CSV
          </button>
        }
      />

      {/* Search */}
      <div className="relative mb-3 max-w-md">
        <Search
          size={14}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticker or company…"
          className="w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-3 text-xs sm:text-sm text-foreground placeholder:text-faint focus:border-[var(--color-accent)] focus:outline-none"
          aria-label="Search historical log"
        />
      </div>

      {/* Filter chips */}
      <div className="mb-3 flex flex-col gap-2 sm:gap-3">
        <FilterChips label="Risk" options={RISK_TIERS} value={tier} onChange={setTier} />
        <FilterChips label="Date" options={DATE_RANGES} value={dateRange} onChange={setDateRange} />
      </div>

      <p className="mb-2 text-xs text-muted sm:mb-3 sm:text-sm">
        {loading
          ? 'Aggregating flagged events…'
          : `${filtered.length} flagged event${filtered.length !== 1 ? 's' : ''}`}
      </p>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(e) => `${e.ticker}-${e.date}`}
        onRowClick={(e) => router.push(`/stocks/${encodeURIComponent(e.ticker)}`)}
        loading={loading}
        emptyMessage="No flagged events match your filters."
        initialSort={{ key: 'date', dir: 'desc' }}
        pageSize={15}
      />
    </div>
  )
}