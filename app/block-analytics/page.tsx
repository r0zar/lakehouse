'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface Block {
  block_hash: string
  block_index: number
  block_time: string | { value: string }
  bitcoin_anchor_hash: string
  bitcoin_anchor_index: number
  transaction_count: number
  total_fees: number | null
  successful_transactions: number
  failed_transactions: number
  success_rate: number | null
  avg_fee_per_transaction: number | null
  unique_addresses: number
  created_at: string | { value: string }
  updated_at: string | { value: string }
}

interface BlockResponse {
  data: Block[]
  pagination: {
    total: number
    limit: number
    offset: number
    has_more: boolean
  }
  summary: {
    total_blocks: number
    total_transactions: number
    total_fees_all_blocks: number
    avg_transactions_per_block: number
    avg_fees_per_block: number
    avg_success_rate: number
    avg_unique_addresses_per_block: number
    latest_block_index: number
    earliest_block_index: number
  }
  filters: {
    limit: number
    offset: number
  }
  timestamp: string
}

export default function BlockAnalyticsPage() {
  const [data, setData] = useState<BlockResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        limit: '100'
      })

      const response = await fetch(`/api/analytics/blocks?${params}`)

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
    
    // Auto-refresh every 15 minutes for block analytics
    const interval = setInterval(fetchData, 900000)
    return () => clearInterval(interval)
  }, [])

  const filteredData = data?.data.filter(item =>
    !searchTerm ||
    item.block_hash.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.block_index.toString().includes(searchTerm)
  ) || []

  const formatFee = (fee: number | null) => {
    if (fee === null || fee === undefined || fee === 0) return '0 STX'
    
    // Convert from microSTX to STX (divide by 1,000,000)
    const stx = fee / 1000000
    
    // For very small amounts, show in μSTX
    if (Math.abs(stx) < 0.001) {
      return `${fee.toLocaleString()} μSTX`
    }
    
    // For normal amounts, show in STX with appropriate decimal places
    return `${stx.toLocaleString(undefined, { 
      maximumFractionDigits: 6,
      minimumFractionDigits: stx < 1 ? 3 : 2
    })} STX`
  }

  const formatTime = (timeStr: string | { value: string }) => {
    const time = typeof timeStr === 'object' && timeStr?.value ? timeStr.value : timeStr
    return new Date(time as string).toLocaleString()
  }

  const formatPercentage = (rate: number | null) => {
    if (rate === null || rate === undefined) return '0%'
    return `${Math.round(rate * 100)}%`
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
            <div className="text-red-500 text-xl mb-4">Error loading block data</div>
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
                Block Analytics
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Blockchain block patterns and transaction metrics
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

        {/* Search */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Search
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search block hash or index..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              />
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
                {data.summary.total_blocks.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Blocks</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-green-600 mb-2">
                {data.summary.avg_transactions_per_block}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Avg Transactions/Block</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-purple-600 mb-2">
                {formatFee(data.summary.avg_fees_per_block)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Avg Fees/Block</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-orange-600 mb-2">
                {data.summary.avg_success_rate}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Avg Success Rate</div>
            </motion.div>
          </div>
        )}

        {/* Blocks Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Blocks ({filteredData.length} results)
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Block
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Transactions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Total Fees
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Success Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Addresses
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredData.map((block, index) => (
                  <motion.tr
                    key={`${block.block_hash}-${index}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          #{block.block_index.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {block.block_hash.substring(0, 20)}...
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {block.transaction_count.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {block.successful_transactions} success, {block.failed_transactions} failed
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {formatFee(block.total_fees)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Avg: {formatFee(block.avg_fee_per_transaction)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        block.success_rate === null || block.success_rate === undefined
                          ? 'text-gray-800 bg-gray-100'
                          : block.success_rate >= 0.95 
                          ? 'text-green-800 bg-green-100' 
                          : block.success_rate >= 0.8
                          ? 'text-yellow-800 bg-yellow-100'
                          : 'text-red-800 bg-red-100'
                      }`}>
                        {formatPercentage(block.success_rate)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {block.unique_addresses.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatTime(block.block_time)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredData.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No blocks found for the selected filters.
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