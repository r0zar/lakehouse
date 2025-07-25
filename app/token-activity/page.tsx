'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface TokenActivity {
  tx_hash: string
  user_address: string
  user_display: string
  block_time: string | { value: string }
  success: boolean
  token_bought: number
  token_sold: number
  other_token_bought: number
  other_token_sold: number
  other_token: string
  router_name: string
  swap_description: string
  // Formatted fields from API
  atomic_token_bought?: string
  atomic_token_sold?: string
  atomic_other_token_bought?: string
  atomic_other_token_sold?: string
  formatted_token_bought?: number
  formatted_token_sold?: number
  formatted_other_token_bought?: number
  formatted_other_token_sold?: number
  formatted_swap_description?: string
}

interface TokenActivityResponse {
  data: TokenActivity[]
  summary: {
    token_name: string
    total_swaps_buying: number
    total_swaps_selling: number
    total_swaps: number
    total_bought: number
    total_sold: number
    // Formatted fields from API
    atomic_total_bought?: string
    atomic_total_sold?: string
    formatted_total_bought?: number
    formatted_total_sold?: number
    display_total_bought?: string
    display_total_sold?: string
  }
  pagination: {
    limit: number
    offset: number
    count: number
  }
  timestamp: string
}

export default function TokenActivityPage() {
  const [data, setData] = useState<TokenActivityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tokenFilter, setTokenFilter] = useState('STX')
  const [userFilter, setUserFilter] = useState('')

  const fetchData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        token: tokenFilter,
        limit: '100'
      })

      if (userFilter.trim()) {
        params.set('user', userFilter.trim())
      }

      const response = await fetch(`/api/analytics/token-activity?${params}`)

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
  }, [tokenFilter, userFilter])

  const formatAmount = (amount: number) => {
    if (!amount || amount === 0) return '0'
    return amount.toLocaleString()
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

  const formatTokenAmount = (amount: number) => {
    if (amount === 0) return ''
    return amount.toLocaleString()
  }

  const popularTokens = ['STX', 'sbtc-token', 'usdh', 'aeusdc', 'ststx', 'usda']

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
            <div className="text-red-500 text-xl mb-4">Error loading token activity</div>
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
                Token Buyers & Sellers
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Recent buying and selling activity for {data?.summary.token_name || tokenFilter}
                {userFilter && (
                  <span className="block text-sm mt-1">
                    Filtered by user: <span className="font-mono text-blue-600">{userFilter.length > 20 ? `${userFilter.substring(0, 10)}...${userFilter.substring(userFilter.length - 6)}` : userFilter}</span>
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href="/defi-flows"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Full DeFi Flows
              </a>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Token Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Select Token:
              </label>
              <div className="flex gap-2 flex-wrap mb-3">
                {popularTokens.map((token) => (
                  <button
                    key={token}
                    onClick={() => setTokenFilter(token)}
                    className={`px-3 py-1 rounded-md text-sm transition-colors ${
                      tokenFilter === token 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                    }`}
                  >
                    {token}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={tokenFilter}
                onChange={(e) => setTokenFilter(e.target.value)}
                placeholder="Or enter token name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* User Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Filter by User Address (optional):
              </label>
              <input
                type="text"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                placeholder="SP1234...ABCD or full address"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700 dark:text-white font-mono"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Paste a Stacks address to see only that user's activity
              </div>
              {userFilter && (
                <button
                  onClick={() => setUserFilter('')}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {data?.summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-green-600 mb-2">
                {data.summary.formatted_total_bought ? 
                  `${data.summary.formatted_total_bought.toLocaleString(undefined, {maximumFractionDigits: 2})} ${data.summary.token_name}` :
                  `${(data.summary.total_bought || 0).toLocaleString()} ${data.summary.token_name}`
                }
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{data.summary.token_name} Acquired</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                from {data.summary.total_swaps_buying?.toLocaleString() || 0} swaps
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-red-600 mb-2">
                {data.summary.formatted_total_sold ? 
                  `${data.summary.formatted_total_sold.toLocaleString(undefined, {maximumFractionDigits: 2})} ${data.summary.token_name}` :
                  `${(data.summary.total_sold || 0).toLocaleString()} ${data.summary.token_name}`
                }
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{data.summary.token_name} Sold</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                from {data.summary.total_swaps_selling?.toLocaleString() || 0} swaps
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-blue-600 mb-2">
                {data.summary.total_swaps.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Swaps</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-green-600 mb-2">
                {formatAmount(data.summary.total_bought)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Bought</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-red-600 mb-2">
                {formatAmount(data.summary.total_sold)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Sold</div>
            </motion.div>
          </div>
        )}

        {/* Activity Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent {data?.summary.token_name || tokenFilter} Activity ({data?.data.length || 0} results)
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              All DeFi transactions where {data?.summary.token_name || tokenFilter} was bought or sold
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Transaction
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Sold
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Bought
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Swap Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Router
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {data?.data.map((activity, index) => (
                  <motion.tr
                    key={`${activity.tx_hash}-${index}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div 
                          className="text-xs text-gray-500 dark:text-gray-400 font-mono cursor-pointer hover:text-blue-600 transition-colors"
                          onClick={() => copyToClipboard(activity.tx_hash)}
                          title="Click to copy full transaction hash"
                        >
                          {activity.tx_hash.substring(0, 8)}...{activity.tx_hash.substring(activity.tx_hash.length - 4)}
                        </div>
                        <a
                          href={`https://explorer.hiro.so/txid/${activity.tx_hash}?chain=mainnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="View on Hiro Explorer"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                      <div className={`text-xs ${activity.success ? 'text-green-600' : 'text-red-600'}`}>
                        {activity.success ? '✓' : '✗'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div 
                        className="text-sm text-gray-900 dark:text-white font-mono cursor-pointer hover:text-blue-600 transition-colors"
                        onClick={() => copyToClipboard(activity.user_address)}
                        title="Click to copy full address"
                      >
                        {activity.user_display}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-red-600">
                        {activity.formatted_token_sold ? `${activity.formatted_token_sold.toLocaleString(undefined, {maximumFractionDigits: 6})} ${data.summary.token_name}` :
                         activity.formatted_other_token_sold ? `${activity.formatted_other_token_sold.toLocaleString(undefined, {maximumFractionDigits: 6})} ${activity.other_token}` :
                         activity.token_sold > 0 ? `${formatTokenAmount(activity.token_sold)} ${data.summary.token_name}` : 
                         activity.other_token_sold > 0 ? `${formatTokenAmount(activity.other_token_sold)} ${activity.other_token}` : '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-green-600">
                        {activity.formatted_token_bought ? `${activity.formatted_token_bought.toLocaleString(undefined, {maximumFractionDigits: 6})} ${data.summary.token_name}` :
                         activity.formatted_other_token_bought ? `${activity.formatted_other_token_bought.toLocaleString(undefined, {maximumFractionDigits: 6})} ${activity.other_token}` :
                         activity.token_bought > 0 ? `${formatTokenAmount(activity.token_bought)} ${data.summary.token_name}` : 
                         activity.other_token_bought > 0 ? `${formatTokenAmount(activity.other_token_bought)} ${activity.other_token}` : '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {activity.formatted_swap_description || activity.swap_description}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {activity.router_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatTime(activity.block_time)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {(!data?.data || data.data.length === 0) && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No recent activity found for {tokenFilter}.
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