'use client'

import React, { useState, useEffect, Fragment } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Editor from '@monaco-editor/react'

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
  token_metadata?: {
    contract_address?: string
    token_symbol?: string
    token_uri?: string
    image_url?: string
    description?: string
    total_supply?: string
    validation_status?: string
  }
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

interface ExpandedRowProps {
  flow: DeFiFlow;
}

function ExpandedRow({ flow }: ExpandedRowProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'tokens' | 'router' | 'analysis'>('overview');
  
  const formatTime = (timeStr: string | { value: string }) => {
    const time = typeof timeStr === 'object' && timeStr?.value ? timeStr.value : timeStr
    return new Date(time as string).toLocaleString()
  }

  const formatFee = (fee: number | undefined | null) => {
    if (!fee) return '0 μSTX'
    return `${fee.toLocaleString()} μSTX`
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'tokens', label: 'Token Events', icon: '🪙', available: !!flow.token_events?.length },
    { id: 'router', label: 'Router Details', icon: '🔄' },
    { id: 'analysis', label: 'Full Data', icon: '📊' }
  ];

  const getStatusColor = (success: boolean) => {
    return success 
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Transaction Information */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Transaction Information
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Transaction Hash</label>
                  <p className="text-gray-900 dark:text-white font-mono text-sm break-all">{flow.tx_hash}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</label>
                  <div>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(flow.success)}`}>
                      {flow.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">User Address</label>
                  <p className="text-gray-900 dark:text-white font-mono text-sm break-all">{flow.swap_user}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Block Time</label>
                  <p className="text-gray-900 dark:text-white">{formatTime(flow.block_time)}</p>
                </div>
              </div>
            </div>

            {/* Transaction Metrics */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Transaction Metrics
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Transaction Fee</label>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {flow.display_transaction_fee || formatFee(flow.transaction_fee)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Tokens Involved</label>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {flow.total_tokens_involved}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Token Events</label>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {flow.token_events?.length || 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Router Summary */}
            <div className="md:col-span-2 space-y-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Router Summary
              </h4>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Router Contract</label>
                    <p className="text-gray-900 dark:text-white font-mono">{flow.router_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Function Called</label>
                    <p className="text-gray-900 dark:text-white font-mono">{flow.router_function}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'tokens':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                Token Flow Events ({flow.token_events?.length || 0})
              </h4>
            </div>
            {flow.token_events && flow.token_events.length > 0 ? (
              <div className="space-y-2">
                {flow.token_events.map((event, index) => (
                  <div key={index} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between">
                      {/* Left side: Direction, Token, and Amount */}
                      <div className="flex items-center gap-3">
                        {/* Token Image with fallback */}
                        <div className="relative w-8 h-8 flex-shrink-0">
                          {event.token_metadata?.image_url ? (
                            <img 
                              src={event.token_metadata.image_url} 
                              alt={event.token_name} 
                              className="w-8 h-8 rounded object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const sibling = e.currentTarget.nextElementSibling as HTMLElement;
                                if (sibling) sibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          {/* Fallback icon */}
                          <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${
                            event.token_metadata?.image_url ? 'hidden' : 'flex'
                          } ${
                            event.token_name === 'STX' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300' :
                            'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          }`}>
                            {event.token_metadata?.token_symbol?.substring(0, 2) || event.token_name.substring(0, 2)}
                          </div>
                        </div>
                        
                        {/* Direction Icon (small) */}
                        <span className={`w-6 h-6 flex items-center justify-center rounded-full text-sm font-bold ${
                          event.direction === 'outgoing' 
                            ? 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300' 
                            : 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300'
                        }`}>
                          {event.direction === 'outgoing' ? '−' : '+'}
                        </span>
                        
                        {/* Token and Amount */}
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {event.display_amount || `${(event.formatted_amount || event.ft_amount).toLocaleString()} ${event.token_metadata?.token_symbol || event.token_name}`}
                          </span>
                          
                          {/* Validation badge (compact) */}
                          {event.token_metadata?.validation_status && event.token_metadata.validation_status !== 'unknown' && (
                            <span className={`inline-flex w-2 h-2 rounded-full ${
                              event.token_metadata.validation_status === 'completed' ? 'bg-green-500' :
                              event.token_metadata.validation_status === 'pending' ? 'bg-yellow-500' :
                              'bg-gray-400'
                            }`} title={`Status: ${event.token_metadata.validation_status}`}>
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Right side: Counterparty */}
                      <div className="text-right">
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {event.direction === 'outgoing' ? 'to' : 'from'}
                        </div>
                        <div className="text-sm font-mono text-gray-700 dark:text-gray-300">
                          {event.counterparty_display}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No token events recorded for this transaction
              </div>
            )}
          </div>
        );

      case 'router':
        return (
          <div className="space-y-6">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
              Router Contract Details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-3">Contract Information</h5>
                <div className="space-y-2 text-sm">
                  <div><strong>Router Name:</strong> {flow.router_name}</div>
                  <div><strong>Function Called:</strong> {flow.router_function}</div>
                  <div><strong>Transaction Status:</strong> <span className={flow.success ? 'text-green-600' : 'text-red-600'}>{flow.success ? 'Success' : 'Failed'}</span></div>
                </div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-3">Transaction Metrics</h5>
                <div className="space-y-2 text-sm">
                  <div><strong>Fee Paid:</strong> {flow.display_transaction_fee || formatFee(flow.transaction_fee)}</div>
                  <div><strong>Tokens Involved:</strong> {flow.total_tokens_involved}</div>
                  <div><strong>Events Count:</strong> {flow.token_events?.length || 0}</div>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h5 className="font-medium text-gray-900 dark:text-white mb-3">User Information</h5>
              <div className="text-sm">
                <div><strong>Swap User:</strong> <span className="font-mono text-xs">{flow.swap_user}</span></div>
                <div className="mt-2"><strong>Transaction Time:</strong> {formatTime(flow.block_time)}</div>
              </div>
            </div>
          </div>
        );

      case 'analysis':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                Complete Transaction Data
              </h4>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                JSON Format
              </span>
            </div>
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              <Editor
                height="600px"
                defaultLanguage="json"
                value={JSON.stringify(flow, null, 2)}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  fontSize: 12,
                  folding: true,
                  lineNumbers: 'on',
                  glyphMargin: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 4
                }}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <motion.div
      className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      <div className="bg-white dark:bg-gray-800 overflow-hidden">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                disabled={tab.available === false}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : tab.available === false
                    ? 'border-transparent text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
                {tab.available === false && (
                  <span className="text-xs text-gray-400 dark:text-gray-600">(N/A)</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {renderTabContent()}
        </div>
      </div>
    </motion.div>
  );
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

        {/* DeFi Flows Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                DeFi Token Flows
              </h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {data?.data.length || 0} results
              </span>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Transaction
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Router
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Fee
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Tokens
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <AnimatePresence>
                  {data?.data.map((flow, index) => (
                    <Fragment key={`${flow.tx_hash}-${index}`}>
                      <motion.tr
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2, delay: index * 0.02 }}
                        onClick={() => toggleRowExpansion(flow.tx_hash)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <div 
                              className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(flow.tx_hash);
                              }}
                              title="Click to copy full transaction hash"
                            >
                              {flow.tx_hash.substring(0, 12)}...
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              <span className="font-medium">User:</span> 
                              <span 
                                className="font-mono cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 ml-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(flow.swap_user);
                                }}
                                title="Click to copy user address"
                              >
                                {flow.swap_user.substring(0, 8)}...{flow.swap_user.substring(flow.swap_user.length - 4)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {flow.router_name.split('.').pop() || flow.router_name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {flow.router_function}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            flow.success 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }`}>
                            {flow.success ? 'Success' : 'Failed'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="text-sm font-mono text-gray-900 dark:text-gray-100">
                            {flow.display_transaction_fee || formatFee(flow.transaction_fee)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                              {flow.total_tokens_involved}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              ({flow.token_events?.length || 0} events)
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {formatTime(flow.block_time)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <motion.button
                            className="text-blue-600 hover:text-blue-900 dark:hover:text-blue-400 transition-colors"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {expandedRows.has(flow.tx_hash) ? (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            ) : (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </motion.button>
                        </td>
                      </motion.tr>
                      
                      {expandedRows.has(flow.tx_hash) && (
                        <tr key={`expanded-${flow.tx_hash}`}>
                          <td colSpan={7} className="p-0">
                            <ExpandedRow flow={flow} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

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