'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface TokenEvent {
  event_type: string
  ft_amount: number
  atomic_amount?: string
  formatted_amount?: number
  display_amount?: string
  decimals?: number
  token_name: string
  direction: 'outgoing' | 'incoming'
  counterparty: string
  counterparty_display: string
}

interface DeFiFlow {
  tx_hash: string
  router_name: string
  router_function: string
  swap_user: string
  success: boolean
  transaction_fee: number
  atomic_transaction_fee?: string
  formatted_transaction_fee?: number
  display_transaction_fee?: string
  block_time: string | { value: string }
  token_events: TokenEvent[]
  total_tokens_involved: number
}

interface RouterBreakdown {
  router_name: string
  transaction_count: number
  successful_transactions: number
  success_rate: number
}

interface DeFiFlowResponse {
  data: DeFiFlow[]
  pagination: {
    limit: number
    offset: number
    count: number
  }
  summary: {
    total_transactions: number
    successful_transactions: number
    success_rate_percent: number
    unique_routers: number
    total_transaction_fees: number
    avg_transaction_fee: number
    atomic_total_transaction_fees?: string
    atomic_avg_transaction_fee?: string
    formatted_total_transaction_fees?: number
    formatted_avg_transaction_fee?: number
    display_total_transaction_fees?: string
    display_avg_transaction_fee?: string
  }
  router_breakdown: RouterBreakdown[]
  timestamp: string
}

export default function DeFiFlowsPage() {
  const [data, setData] = useState<DeFiFlowResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [routerFilter, setRouterFilter] = useState('')
  const [successFilter, setSuccessFilter] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const fetchData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        limit: '100'
      })

      if (routerFilter) params.set('router', routerFilter)
      if (successFilter) params.set('success', successFilter)

      const response = await fetch(`/api/analytics/defi-flows?${params}`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [routerFilter, successFilter])

  const formatSTX = (amount: number) => {
    if (amount === 0) return '0 STX'
    const stx = amount / 1000000
    if (Math.abs(stx) < 0.001) return `${amount.toLocaleString()} μSTX`
    return `${stx.toLocaleString(undefined, { maximumFractionDigits: 3 })} STX`
  }

  const formatFee = (fee: number | undefined | null) => {
    if (!fee) return '0 μSTX'
    return `${fee.toLocaleString()} μSTX`
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }

  const formatTime = (timeStr: string | { value: string }) => {
    const time = typeof timeStr === 'object' && timeStr?.value ? timeStr.value : timeStr
    return new Date(time as string).toLocaleString()
  }


  const toggleRowExpansion = (txHash: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(txHash)) {
      newExpanded.delete(txHash)
    } else {
      newExpanded.add(txHash)
    }
    setExpandedRows(newExpanded)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="container mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="container mx-auto">
          <div className="text-center py-20">
            <div className="text-red-500 text-xl mb-4">Error loading DeFi flow data</div>
            <div className="text-gray-600 dark:text-gray-300">{error}</div>
            <button
              onClick={fetchData}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="container mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                DeFi Flow Analytics
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Comprehensive token flow analysis across all Stacks DeFi protocols
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href="/"
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Dashboard
              </a>
            </div>
          </div>
        </header>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Router Contract
              </label>
              <select
                value={routerFilter}
                onChange={(e) => setRouterFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              >
                <option value="">All Routers</option>
                {data?.router_breakdown.map((router) => (
                  <option key={router.router_name} value={router.router_name}>
                    {router.router_name} ({router.transaction_count})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Success Status
              </label>
              <select
                value={successFilter}
                onChange={(e) => setSuccessFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              >
                <option value="">All Status</option>
                <option value="true">Successful</option>
                <option value="false">Failed</option>
              </select>
            </div>
            <div className="md:col-span-2 flex items-end">
              <button
                onClick={() => {
                  setRouterFilter('')
                  setSuccessFilter('')
                }}
                className="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {data?.summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-blue-600 mb-2">
                {data.summary.total_transactions.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Transactions</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {data.summary.success_rate_percent}% success rate
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-green-600 mb-2">
                {data.summary.successful_transactions.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Successful</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {data.summary.total_transactions - data.summary.successful_transactions} failed
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-purple-600 mb-2">
                {data.summary.unique_routers}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Active Routers</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Contract variants
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-orange-600 mb-2">
                {data.summary.display_avg_transaction_fee || formatFee(data.summary.avg_transaction_fee)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Avg TX Fee</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Total: {data.summary.display_total_transaction_fees || formatFee(data.summary.total_transaction_fees)}
              </div>
            </motion.div>
          </div>
        )}

        {/* Router Breakdown - Hidden for now */}
        {false && data?.router_breakdown && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Router Contract Usage
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.router_breakdown?.map((router) => (
                <div key={router.router_name} className="text-center border rounded-lg p-4">
                  <div className="font-medium text-gray-900 dark:text-white mb-2 text-sm">
                    {router.router_name}
                  </div>
                  <div className="text-lg font-bold text-blue-600">
                    {router.transaction_count.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {Math.round(router.success_rate)}% success
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {router.successful_transactions} / {router.transaction_count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flows Cards */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent DeFi Token Flows
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {data?.data.length || 0} results
            </span>
          </div>

          {data?.data.map((flow, index) => (
            <motion.div
              key={`${flow.tx_hash}-${index}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div 
                      className="font-mono text-sm text-blue-600 dark:text-blue-400 cursor-pointer hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                      onClick={() => copyToClipboard(flow.tx_hash)}
                      title="Click to copy full transaction hash"
                    >
                      {flow.tx_hash.substring(0, 12)}...
                    </div>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      flow.success 
                        ? 'text-green-800 bg-green-100 dark:text-green-200 dark:bg-green-900' 
                        : 'text-red-800 bg-red-100 dark:text-red-200 dark:bg-red-900'
                    }`}>
                      {flow.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>Fee: {flow.display_transaction_fee || formatFee(flow.transaction_fee)}</span>
                    <span>{formatTime(flow.block_time)}</span>
                    <span>{flow.total_tokens_involved} tokens</span>
                  </div>
                </div>
                <button
                  onClick={() => toggleRowExpansion(flow.tx_hash)}
                  className="flex items-center gap-1 px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <svg 
                    className={`h-3 w-3 transition-transform ${expandedRows.has(flow.tx_hash) ? 'rotate-90' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  JSON
                </button>
              </div>

              {/* Router Info */}
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                  {flow.router_name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {flow.router_function}
                </div>
              </div>

              {/* Token Flow */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Token Flow</h4>
                {flow.token_events && flow.token_events.length > 0 ? (
                  <div className="grid gap-2">
                    {flow.token_events.map((event, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                            event.direction === 'outgoing' 
                              ? 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300' 
                              : 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300'
                          }`}>
                            {event.direction === 'outgoing' ? '−' : '+'}
                          </span>
                          <span className="font-mono text-sm font-medium">
                            {event.display_amount || `${(event.formatted_amount || event.ft_amount).toLocaleString()} ${event.token_name}`}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {event.direction === 'outgoing' ? 'to' : 'from'} {event.counterparty_display}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400">No token events</div>
                )}
              </div>

              {/* Expanded JSON */}
              {expandedRows.has(flow.tx_hash) && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Full Transaction Data
                  </h4>
                  <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded p-3 overflow-x-auto">
                    {JSON.stringify(flow, null, 2)}
                  </pre>
                </div>
              )}
            </motion.div>
          ))}

          {(!data?.data || data.data.length === 0) && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <div className="text-lg mb-2">No DeFi flows found</div>
              <div className="text-sm">Try adjusting your filters or check back later.</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Last updated: {data?.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown'}
        </div>
      </div>
    </div>
  )
}