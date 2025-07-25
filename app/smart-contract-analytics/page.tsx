'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface SmartContract {
  contract_identifier: string
  contract_deployer: string
  contract_name: string
  action: string
  event_count: number
  unique_transactions: number
  unique_blocks: number
  successful_transactions: number
  failed_transactions: number
  success_rate: number | null
  avg_transaction_fee: number | null
  total_fees_generated: number | null
  protocol_category: string
  activity_level: string
  first_seen: string | { value: string }
  last_seen: string | { value: string }
  updated_at: string | { value: string }
}

interface ProtocolBreakdown {
  protocol_category: string
  contract_count: number
  total_events: number
  avg_success_rate: number
  total_fees: number
}

interface SmartContractResponse {
  data: SmartContract[]
  pagination: {
    total: number
    limit: number
    offset: number
    has_more: boolean
  }
  summary: {
    total_contracts: number
    total_actions: number
    total_events: number
    total_transactions: number
    avg_success_rate: number
    total_fees_all_contracts: number
    activity_distribution: {
      very_high: number
      high: number
      medium: number
      low: number
    }
  }
  protocol_breakdown: ProtocolBreakdown[]
  filters: {
    protocol_category: string | null
    activity_level: string | null
    contract_search: string | null
    limit: number
    offset: number
  }
  timestamp: string
}

export default function SmartContractAnalyticsPage() {
  const [data, setData] = useState<SmartContractResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [protocolFilter, setProtocolFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const fetchData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        limit: '100'
      })

      if (protocolFilter) params.set('protocol_category', protocolFilter)
      if (activityFilter) params.set('activity_level', activityFilter)
      if (searchTerm) params.set('contract_search', searchTerm)

      const response = await fetch(`/api/analytics/smart-contracts?${params}`)

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
  }, [protocolFilter, activityFilter])

  const handleSearch = () => {
    fetchData()
  }

  const formatFee = (fee: number | null) => {
    if (fee === null || fee === undefined) return '0 μSTX'
    if (fee === 0) return '0 μSTX'
    // Convert large amounts to STX for readability
    if (fee >= 1000000) {
      return `${(fee / 1000000).toLocaleString(undefined, { maximumFractionDigits: 2 })} STX`
    }
    return `${fee.toLocaleString()} μSTX`
  }

  const formatTime = (timeStr: string | { value: string }) => {
    const time = typeof timeStr === 'object' && timeStr?.value ? timeStr.value : timeStr
    return new Date(time as string).toLocaleString()
  }

  const formatPercentage = (rate: number | null) => {
    if (rate === null || rate === undefined) return '0%'
    return `${Math.round(rate * 100)}%`
  }

  const getActivityColor = (level: string) => {
    const colors = {
      'very_high': 'bg-red-100 text-red-800',
      'high': 'bg-orange-100 text-orange-800',
      'medium': 'bg-yellow-100 text-yellow-800',
      'low': 'bg-green-100 text-green-800'
    }
    return colors[level as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  const getProtocolColor = (category: string) => {
    const colors = {
      'DEX - Stableswap': 'bg-blue-100 text-blue-800',
      'DEX - AMM': 'bg-cyan-100 text-cyan-800',
      'Lending': 'bg-purple-100 text-purple-800',
      'Stacking': 'bg-green-100 text-green-800',
      'Token Contract': 'bg-yellow-100 text-yellow-800',
      'DeFi Aggregator': 'bg-indigo-100 text-indigo-800',
      'Other': 'bg-gray-100 text-gray-800'
    }
    return colors[category as keyof typeof colors] || 'bg-gray-100 text-gray-800'
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
            <div className="text-red-500 text-xl mb-4">Error loading smart contract data</div>
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
                Smart Contract Analytics
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Contract usage patterns, protocol categorization, and activity metrics
              </p>
            </div>
            <a
              href="/"
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </a>
          </div>
        </header>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Protocol Category
              </label>
              <select
                value={protocolFilter}
                onChange={(e) => setProtocolFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              >
                <option value="">All Categories</option>
                <option value="DEX - Stableswap">DEX - Stableswap</option>
                <option value="DEX - AMM">DEX - AMM</option>
                <option value="Lending">Lending</option>
                <option value="Stacking">Stacking</option>
                <option value="Token Contract">Token Contract</option>
                <option value="DeFi Aggregator">DeFi Aggregator</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Activity Level
              </label>
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              >
                <option value="">All Levels</option>
                <option value="very_high">Very High</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Search Contract
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by contract name..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleSearch}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {data?.summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-blue-600 mb-2">
                {data.summary.total_contracts.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Contracts</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-green-600 mb-2">
                {data.summary.total_events.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Events</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-purple-600 mb-2">
                {data.summary.avg_success_rate}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Avg Success Rate</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-orange-600 mb-2">
                {formatFee(data.summary.total_fees_all_contracts)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Fees</div>
            </motion.div>
          </div>
        )}

        {/* Protocol Breakdown */}
        {data?.protocol_breakdown && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Protocol Category Breakdown
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.protocol_breakdown.map((protocol) => (
                <div key={protocol.protocol_category} className="text-center">
                  <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium mb-2 ${getProtocolColor(protocol.protocol_category)}`}>
                    {protocol.protocol_category}
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {protocol.contract_count} contracts
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {protocol.total_events.toLocaleString()} events
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {Math.round(protocol.avg_success_rate * 100)}% success
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contracts Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Smart Contracts ({data?.data.length || 0} results)
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Contract
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Events
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Success Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Activity
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {data?.data.map((contract, index) => (
                  <motion.tr
                    key={`${contract.contract_identifier}-${contract.action}-${index}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {contract.contract_name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {contract.contract_deployer}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {contract.action}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {contract.event_count.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {contract.unique_transactions} txs, {contract.unique_blocks} blocks
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        contract.success_rate === null || contract.success_rate === undefined
                          ? 'text-gray-800 bg-gray-100'
                          : contract.success_rate >= 0.95 
                          ? 'text-green-800 bg-green-100' 
                          : contract.success_rate >= 0.8
                          ? 'text-yellow-800 bg-yellow-100'
                          : 'text-red-800 bg-red-100'
                      }`}>
                        {formatPercentage(contract.success_rate)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getProtocolColor(contract.protocol_category)}`}>
                        {contract.protocol_category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getActivityColor(contract.activity_level)}`}>
                        {contract.activity_level.replace('_', ' ')}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {(!data?.data || data.data.length === 0) && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No smart contracts found for the selected filters.
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