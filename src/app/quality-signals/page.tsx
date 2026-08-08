'use client'

import { useEffect, useState } from 'react'
import * as React from 'react'
import { PageHeader } from '@/components/PageHeader'
import { DemoBadge } from '@/components/DemoBadge'
import { DataTable, type Column } from '@/components/DataTable'
import { Pill } from '@/components/RiskPill'
import { getQualitySignalsDefaults, getQualitySignals } from '@/lib/api'
import type { QualitySignalsDefaults, QualitySignal } from '@/lib/types'
import { Zap } from 'lucide-react'

export default function QualitySignalsPage() {
  const [defaults, setDefaults] = useState<QualitySignalsDefaults | null>(null)
  const [signals, setSignals] = useState<QualitySignal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [demo, setDemo] = useState(false)

  // Settings panel state
  const [minWindowScore, setMinWindowScore] = useState(60)
  const [minForwardReturn, setMinForwardReturn] = useState(15)
  const [minSignals, setMinSignals] = useState(3)
  const [avrThreshold, setAvrThreshold] = useState(2.5)

  // Load defaults and initial signals
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const defaultRes = await getQualitySignalsDefaults()
      setDefaults(defaultRes.data)
      setMinWindowScore(defaultRes.data.min_window_score)
      setMinForwardReturn(defaultRes.data.min_forward_return_pct)
      setMinSignals(defaultRes.data.min_signals_in_window)
      setAvrThreshold(defaultRes.data.avr_threshold)

      const signalsRes = await getQualitySignals(defaultRes.data)
      setSignals(signalsRes.data)
      setDemo(signalsRes.demo)
      setLoading(false)
    }
    load()
  }, [])

  // Refetch signals when any slider changes, debounced. Each call re-runs the
  // full 3-stage detection pipeline across every stock on the real backend —
  // firing it on every pixel of a drag (the previous behaviour) would queue
  // dozens of redundant full recomputations per second. This waits until the
  // user pauses for 400ms, and ignores any response that isn't from the
  // latest request (in case a slow request resolves after a newer one).
  const requestIdRef = React.useRef(0)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleParamChange = (minWin: number, minFwd: number, minSig: number, avrThr: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setRefreshing(true)
    debounceRef.current = setTimeout(async () => {
      const thisRequestId = ++requestIdRef.current
      const res = await getQualitySignals({
        min_window_score: minWin,
        min_forward_return_pct: minFwd,
        min_signals_in_window: minSig,
        avr_threshold: avrThr,
      })
      if (thisRequestId !== requestIdRef.current) return // a newer request superseded this one
      setSignals(res.data)
      setDemo(res.demo)
      setRefreshing(false)
    }, 400)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const qualityTierColor = (tier: string) => {
    switch (tier) {
      case 'High':
        return 'green'
      case 'Medium':
        return 'yellow'
      case 'Low':
        return 'orange'
      default:
        return 'gray'
    }
  }

  const columns: Column<QualitySignal>[] = [
    {
      key: 'ticker',
      header: 'Ticker',
      render: (row) => (
        <span className="font-medium text-foreground">{row.ticker}</span>
      ),
      sortValue: (row) => row.ticker,
      priority: true,
    },
    {
      key: 'company',
      header: 'Company',
      render: (row) => <span className="text-muted">{row.company}</span>,
      sortValue: (row) => row.company,
    },
    {
      key: 'window_score',
      header: 'Window Score',
      render: (row) => (
        <span className="font-medium text-foreground">{row.window_score.toFixed(1)}</span>
      ),
      sortValue: (row) => row.window_score,
      priority: true,
    },
    {
      key: 'forward_return',
      header: 'Forward Return %',
      render: (row) => (
        <span className={row.forward_return_pct >= 0 ? 'text-green-600' : 'text-red-600'}>
          {row.forward_return_pct.toFixed(2)}%
        </span>
      ),
      sortValue: (row) => row.forward_return_pct,
      align: 'right',
    },
    {
      key: 'signals',
      header: 'Signals',
      render: (row) => <span className="text-foreground">{row.signals_in_window}</span>,
      sortValue: (row) => row.signals_in_window,
    },
    {
      key: 'tier',
      header: 'Quality',
      render: (row) => <Pill color={qualityTierColor(row.quality_tier)}>{row.quality_tier}</Pill>,
      priority: true,
    },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Quality Signals"
        subtitle="Analysis-ready stocks with quality metrics and forward return potential"
        icon={<Zap size={18} strokeWidth={1.75} />}
        badge={demo && <DemoBadge />}
      />

      {/* Settings Panel */}
      <div className="rounded-md border border-border bg-card p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-faint">Filters</h2>
        <div className="space-y-4 sm:space-y-5">
          {/* Min Window Score */}
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              Min Window Score: {minWindowScore}
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={minWindowScore}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                setMinWindowScore(val)
                handleParamChange(val, minForwardReturn, minSignals, avrThreshold)
              }}
              className="w-full"
            />
          </div>

          {/* Min Forward Return */}
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              Min Forward Return: {minForwardReturn.toFixed(1)}%
            </label>
            <input
              type="range"
              min="0"
              max="50"
              step="0.5"
              value={minForwardReturn}
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                setMinForwardReturn(val)
                handleParamChange(minWindowScore, val, minSignals, avrThreshold)
              }}
              className="w-full"
            />
          </div>

          {/* Min Signals */}
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              Min Signals in Window: {minSignals}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={minSignals}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                setMinSignals(val)
                handleParamChange(minWindowScore, minForwardReturn, val, avrThreshold)
              }}
              className="w-full"
            />
          </div>

          {/* AVR Threshold */}
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              AVR Threshold: {avrThreshold.toFixed(2)}x
            </label>
            <input
              type="range"
              min="1"
              max="5"
              step="0.1"
              value={avrThreshold}
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                setAvrThreshold(val)
                handleParamChange(minWindowScore, minForwardReturn, minSignals, val)
              }}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div>
        <div className="mb-2 flex items-center gap-2 sm:mb-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-faint sm:text-sm">
            Matching Stocks
          </h2>
          <Pill color="gray">{signals.length} stocks</Pill>
          {refreshing && <Pill color="blue">Recalculating…</Pill>}
        </div>
        <DataTable
          rows={signals}
          columns={columns}
          rowKey={(row) => row.ticker}
          loading={loading}
          pageSize={20}
          initialSort={{ key: 'window_score', dir: 'desc' }}
        />
      </div>
    </div>
  )
}