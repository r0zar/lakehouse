'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ContractFunction {
  function_name: string
  transaction_count: number
  unique_callers: number
  success_rate_percent: number
}

interface ContractActivity {
  contract_identifier: string
  contract_name: string
  deployer_address: string
  period_start: string
  period_end: string
  active_days: number
  total_unique_functions: number
  total_transactions: number
  total_unique_callers: number
  total_successful_calls: number
  total_failed_calls: number
  success_rate_percent: number
  total_contract_fees: number
  avg_fee_per_call: number
  total_amount_transferred: number
  first_call_time: string
  last_call_time: string
  total_activity_duration_seconds: number
  avg_daily_transactions: number
  avg_daily_fees: number
  top_functions: ContractFunction[]
  created_at: string
}

interface ContractActivityResponse {
  data: ContractActivity[]
  pagination: {
    total: number
    limit: number
    offset: number
    has_more: boolean
  }
  summary: {
    unique_contracts: number
    total_active_days: number
    total_transactions: number
    total_unique_callers: number
    total_fees: number
    avg_success_rate: number
    latest_period_end: string
    earliest_period_start: string
  }
  filters: {
    days: number
    contract: string | null
    limit: number
    offset: number
  }
  timestamp: string
}

export default function ContractActivityPage() {
  const [data, setData] = useState<ContractActivityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [days, setDays] = useState(30)
  const [contractFilter, setContractFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const fetchData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        days: days.toString(),
        limit: '100'
      })

      if (contractFilter.trim()) {
        params.set('contract', contractFilter.trim())
      }

      const response = await fetch(`/api/analytics/contract-activity?${params}`)

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
    
    // Auto-refresh every 5 minutes for contract activity patterns
    const interval = setInterval(fetchData, 300000)
    return () => clearInterval(interval)
  }, [days])

  const toggleRow = (contractId: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(contractId)) {
      newExpanded.delete(contractId)
    } else {
      newExpanded.add(contractId)
    }
    setExpandedRows(newExpanded)
  }

  const filteredData = data?.data.filter(item =>
    !searchTerm ||
    item.contract_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.contract_identifier.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const formatFee = (fee: number) => {
    if (fee === 0) return '0 μSTX'
    return `${fee.toLocaleString()} μSTX`
  }

  const formatDate = (dateStr: string | { value: string }) => {
    const date = typeof dateStr === 'object' && dateStr?.value ? dateStr.value : dateStr
    return new Date(date as string).toLocaleDateString()
  }

  const formatTime = (timeStr: string | { value: string }) => {
    const time = typeof timeStr === 'object' && timeStr?.value ? timeStr.value : timeStr
    return new Date(time as string).toLocaleString()
  }

  const formatTimeSpan = (startTime: string | { value: string }, endTime: string | { value: string }) => {
    const start = typeof startTime === 'object' && startTime?.value ? startTime.value : startTime
    const end = typeof endTime === 'object' && endTime?.value ? endTime.value : endTime

    const startDate = new Date(start as string)
    const endDate = new Date(end as string)
    const diffMs = endDate.getTime() - startDate.getTime()

    // Convert to different units
    const minutes = Math.floor(diffMs / (1000 * 60))
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    const now = new Date()
    const endDateDiff = now.getTime() - endDate.getTime()
    const endMinutesAgo = Math.floor(endDateDiff / (1000 * 60))
    const endHoursAgo = Math.floor(endDateDiff / (1000 * 60 * 60))
    const endDaysAgo = Math.floor(endDateDiff / (1000 * 60 * 60 * 24))

    let timeAgoText = ''
    if (endDaysAgo > 0) {
      timeAgoText = `${endDaysAgo} day${endDaysAgo > 1 ? 's' : ''} ago`
    } else if (endHoursAgo > 0) {
      timeAgoText = `${endHoursAgo} hour${endHoursAgo > 1 ? 's' : ''} ago`
    } else if (endMinutesAgo > 0) {
      timeAgoText = `${endMinutesAgo} minute${endMinutesAgo > 1 ? 's' : ''} ago`
    } else {
      timeAgoText = 'just now'
    }

    // Format the span duration
    if (days > 0) {
      return `over ${days} day${days > 1 ? 's' : ''} (ended ${timeAgoText})`
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} (ended ${timeAgoText})`
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} (ended ${timeAgoText})`
    } else {
      return `under a minute (ended ${timeAgoText})`
    }
  }

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600 bg-green-100'
    if (rate >= 80) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
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
            <div className="text-red-500 text-xl mb-4">Error loading contract activity data</div>
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Contract Activity Analytics
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Smart contract usage metrics and function call analytics
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Time Range
              </label>
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              >
                <option value={7}>Last 7 Days</option>
                <option value={30}>Last 30 Days</option>
                <option value={90}>Last 90 Days</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Search Contracts
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or identifier..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Server Filter
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={contractFilter}
                  onChange={(e) => setContractFilter(e.target.value)}
                  placeholder="Contract identifier..."
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                />
                <button
                  onClick={fetchData}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Filter
                </button>
              </div>
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
                {data.summary.unique_contracts.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Active Contracts</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-green-600 mb-2">
                {data.summary.total_transactions.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Transactions</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-purple-600 mb-2">
                {data.summary.total_unique_callers.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Unique Callers</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-orange-600 mb-2">
                {Math.round(data.summary.avg_success_rate)}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Avg Success Rate</div>
            </motion.div>
          </div>
        )}

        {/* Contract Activity Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Contract Activity ({filteredData.length} contracts)
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
                    Transactions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Functions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Success Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Total Fees
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredData.map((activity) => {
                  const rowKey = activity.contract_identifier
                  const isExpanded = expandedRows.has(rowKey)

                  return (
                    <React.Fragment key={rowKey}>
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {activity.contract_name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {activity.contract_identifier}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-white">
                            {activity.total_transactions.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {activity.total_unique_callers} callers
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {activity.total_unique_functions}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSuccessRateColor(activity.success_rate_percent)}`}>
                            {Math.round(activity.success_rate_percent)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {formatFee(activity.total_contract_fees)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => toggleRow(activity.contract_identifier)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            {isExpanded ? 'Collapse' : 'Expand'}
                          </button>
                        </td>
                      </motion.tr>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.tr
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <td colSpan={6} className="px-6 py-4 bg-gray-50 dark:bg-gray-700">
                              <div className="space-y-4">
                                {/* Function Breakdown - Parse JSON string */}
                                {(() => {
                                  try {
                                    const topFunctions = typeof activity.top_functions === 'string'
                                      ? JSON.parse(activity.top_functions)
                                      : activity.top_functions || []

                                    return topFunctions.length > 0 && (
                                      <div>
                                        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                                          Top Functions Called
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                          {topFunctions.map((func: any, index: number) => (
                                            <div key={index} className="bg-white dark:bg-gray-800 p-3 rounded-md">
                                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                {func.function_name}
                                              </div>
                                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {func.total_transaction_count || func.transaction_count} calls • {func.total_unique_callers || func.unique_callers} callers
                                              </div>
                                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                                {Math.round(func.success_rate_percent)}% success
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )
                                  } catch (error) {
                                    return null
                                  }
                                })()}

                                {/* Additional Details */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <div className="text-gray-500 dark:text-gray-400">Daily Average</div>
                                    <div className="text-gray-900 dark:text-white">
                                      {activity.avg_daily_transactions} txs/day
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      {formatFee(activity.avg_daily_fees)}/day
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-gray-500 dark:text-gray-400">Average Fee</div>
                                    <div className="text-gray-900 dark:text-white">
                                      {formatFee(activity.avg_fee_per_call)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-gray-500 dark:text-gray-400">Total Amount</div>
                                    <div className="text-gray-900 dark:text-white">
                                      {typeof activity.total_amount_transferred === 'string'
                                        ? parseInt(activity.total_amount_transferred).toLocaleString()
                                        : activity.total_amount_transferred.toLocaleString()}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-gray-500 dark:text-gray-400">Activity Span</div>
                                    <div className="text-gray-900 dark:text-white">
                                      {Math.round(activity.total_activity_duration_seconds / 3600)} hours
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      {formatTime(activity.first_call_time)} - {formatTime(activity.last_call_time)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filteredData.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No contract activity found for the selected filters.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Last updated: {data?.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown'}
          <br />
          Auto-refreshes every 5 minutes
        </div>
      </div>
    </div>
  )
}