'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search, Download } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { DataTable, type Column } from '@/components/DataTable'
import { RiskPill, Pill } from '@/components/RiskPill'
import { DemoBadge } from '@/components/DemoBadge'
import { FilterChips } from '@/components/FilterChips'
import { getStocks, getFlags } from '@/lib/api'
import { formatDate, exportToCSV, tierFromScore } from '@/lib/utils'
import type { StockListItem } from '@/lib/types'

const RISK_TIERS = ['All', 'Critical', 'High', 'Medium', 'Low', 'Clean']
const SECTORS = ['All', 'Banking', 'IT', 'Energy', 'Pharma', 'Auto', 'FMCG', 'NBFC', 'Utilities', 'Equity']
const DATE_RANGES = ['Any time', 'Last 30 days', 'Last 60 days', 'Last 90 days']

function withinDays(dateStr: string | null, days: number): boolean {
  if (!dateStr) return false
  const cutoff = new Date('2026-06-24')
  cutoff.setDate(cutoff.getDate() - days)
  return new Date(dateStr) >= cutoff
}

export default function StocksExplorerPage() {
  const router = useRouter()
  const [stocks, setStocks] = React.useState<StockListItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [demo, setDemo] = React.useState(false)

  const [search, setSearch] = React.useState('')
  const [tier, setTier] = React.useState('All')
  const [sector, setSector] = React.useState('All')
  const [dateRange, setDateRange] = React.useState('Any time')

  React.useEffect(() => {
    let active = true
    // /stocks alone has no score/risk data — /flags covers every scorable
    // ticker (not just a "top N" subset, see build_flags_summary()), so we
    // cross-reference it here to get each stock's real peak score and risk
    // tier instead of leaving every real ticker stuck at the Clean/0 default.
    Promise.all([getStocks(), getFlags()]).then(([stocksRes, flagsRes]) => {
      if (!active) return
      const flagByTicker = new Map(flagsRes.data.map((f) => [f.ticker, f]))
      const enriched = stocksRes.data.map((s) => {
        const flag = flagByTicker.get(s.ticker)
        if (!flag) return s
        return {
          ...s,
          latestScore: flag.peakScore,
          riskTier: tierFromScore(flag.peakScore),
          lastFlagged: flag.flaggedDate || s.lastFlagged,
        }
      })
      setStocks(enriched)
      setDemo(stocksRes.demo || flagsRes.demo)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return stocks.filter((s) => {
      if (q && !s.ticker.toLowerCase().includes(q) && !s.company.toLowerCase().includes(q))
        return false
      if (tier !== 'All' && s.riskTier !== tier) return false
      if (sector !== 'All' && s.sector !== sector) return false
      if (dateRange === 'Last 30 days' && !withinDays(s.lastFlagged, 30)) return false
      if (dateRange === 'Last 60 days' && !withinDays(s.lastFlagged, 60)) return false
      if (dateRange === 'Last 90 days' && !withinDays(s.lastFlagged, 90)) return false
      return true
    })
  }, [stocks, search, tier, sector, dateRange])

  const columns: Column<StockListItem>[] = [
    {
      key: 'ticker',
      header: 'Ticker',
      priority: true,
      render: (r) => <span className="font-medium text-foreground">{r.ticker}</span>,
      sortValue: (r) => r.ticker,
    },
    {
      key: 'company',
      header: 'Company',
      render: (r) => <span className="text-muted">{r.company}</span>,
      sortValue: (r) => r.company,
    },
    {
      key: 'sector',
      header: 'Sector',
      render: (r) => <Pill color="gray">{r.sector}</Pill>,
      sortValue: (r) => r.sector,
    },
    {
      key: 'exchange',
      header: 'Exchange',
      render: (r) => <span className="text-muted">{r.exchange}</span>,
      sortValue: (r) => r.exchange,
    },
    {
      key: 'latestScore',
      header: 'Score',
      align: 'right',
      priority: true,
      render: (r) => <span className="font-medium tabular-nums">{r.latestScore}</span>,
      sortValue: (r) => r.latestScore,
    },
    {
      key: 'riskTier',
      header: 'Risk',
      priority: true,
      render: (r) => <RiskPill tier={r.riskTier} />,
      sortValue: (r) => r.latestScore,
    },
    {
      key: 'lastFlagged',
      header: 'Last Flagged',
      render: (r) => <span className="text-muted">{formatDate(r.lastFlagged)}</span>,
      sortValue: (r) => r.lastFlagged ?? '',
    },
  ]

  function handleExport() {
    exportToCSV(
      filtered.map((s) => ({
        Ticker: s.ticker,
        Company: s.company,
        Sector: s.sector,
        Exchange: s.exchange,
        RiskTier: s.riskTier,
        LatestScore: s.latestScore,
        LastFlagged: s.lastFlagged ?? '',
      })),
      'tradewatch-stocks.csv',
    )
  }

  return (
    <div>
      <PageHeader
        title="Stocks Explorer"
        subtitle="Search, filter, and browse every tracked NSE & BSE ticker."
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

      {/* Search box */}
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
          aria-label="Search stocks"
        />
      </div>

      {/* Filter chips */}
      <div className="mb-3 flex flex-col gap-2 sm:gap-3">
        <FilterChips label="Risk" options={RISK_TIERS} value={tier} onChange={setTier} />
        <FilterChips label="Sector" options={SECTORS} value={sector} onChange={setSector} />
        <FilterChips
          label="Flagged"
          options={DATE_RANGES}
          value={dateRange}
          onChange={setDateRange}
        />
      </div>

      <p className="mb-2 text-xs text-muted sm:mb-3 sm:text-sm">
        {loading ? 'Loading…' : `${filtered.length} stock${filtered.length !== 1 ? 's' : ''}`}
      </p>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.ticker}
        onRowClick={(r) => router.push(`/stocks/${encodeURIComponent(r.ticker)}`)}
        loading={loading}
        emptyMessage="No stocks match your filters."
        initialSort={{ key: 'latestScore', dir: 'desc' }}
        pageSize={12}
      />
    </div>
  )
}