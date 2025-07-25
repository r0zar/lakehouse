'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface Transaction {
  tx_hash: string
  block_hash: string
  block_index: number
  description: string
  fee: number
  success: boolean
  operation_count: number
  transaction_type: string
  fee_per_operation: number
  fee_category: string
  status: string
  webhook_path: string
  created_at: string | { value: string }
  updated_at: string | { value: string }
}

interface TransactionType {
  transaction_type: string
  count: number
  percentage: number
  avg_fee: number
  success_rate: number
}

interface TransactionResponse {
  data: Transaction[]
  pagination: {
    total: number
    limit: number
    offset: number
    has_more: boolean
  }
  summary: {
    total_transactions: number
    successful_transactions: number
    failed_transactions: number
    success_rate_percent: number
    total_fees: number
    avg_fee: number
    max_fee: number
    min_fee: number
    unique_transaction_types: number
    avg_operations_per_tx: number
  }
  transaction_types: TransactionType[]
  filters: {
    type: string | null
    status: string | null
    fee_category: string | null
    limit: number
    offset: number
  }
  timestamp: string
}

export default function TransactionAnalyticsPage() {
  const [data, setData] = useState<TransactionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [feeFilter, setFeeFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const fetchData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        limit: '100'
      })

      if (typeFilter) params.set('type', typeFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (feeFilter) params.set('fee_category', feeFilter)

      const response = await fetch(`/api/analytics/transactions?${params}`)

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
  }, [typeFilter, statusFilter, feeFilter])

  const filteredData = data?.data.filter(item =>
    !searchTerm ||
    item.tx_hash.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const toggleRowExpansion = (txHash: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(txHash)) {
      newExpanded.delete(txHash)
    } else {
      newExpanded.add(txHash)
    }
    setExpandedRows(newExpanded)
  }

  const parseContractCall = (description: string) => {
    // Parse "invoked: CONTRACT_ADDRESS.CONTRACT_NAME::FUNCTION_NAME(ARGS)"
    const invokedMatch = description.match(/^invoked:\s*(.+?)\.(.+?)::(.+?)\((.*)?\)$/)
    if (invokedMatch) {
      const [, contractAddress, contractName, functionName, argsString] = invokedMatch
      // Parse arguments - they're comma-separated but may contain nested commas
      const args = []
      if (argsString && argsString.trim()) {
        let current = ''
        let depth = 0
        for (let i = 0; i < argsString.length; i++) {
          const char = argsString[i]
          if (char === ',' && depth === 0) {
            args.push(current.trim())
            current = ''
          } else {
            if (char === '(' || char === '{' || char === '[') depth++
            if (char === ')' || char === '}' || char === ']') depth--
            current += char
          }
        }
        if (current.trim()) args.push(current.trim())
      }
      
      return {
        isContractCall: true,
        contractAddress,
        contractName,
        functionName,
        args,
        fullContract: `${contractAddress}.${contractName}`
      }
    }
    return { isContractCall: false }
  }

  const formatFee = (fee: number) => {
    if (fee === 0) return '0 μSTX'
    return `${fee.toLocaleString()} μSTX`
  }

  const formatTime = (timeStr: string | { value: string }) => {
    const time = typeof timeStr === 'object' && timeStr?.value ? timeStr.value : timeStr
    return new Date(time as string).toLocaleString()
  }

  const getTypeColor = (type: string) => {
    const colors = {
      'contract_call': 'bg-blue-100 text-blue-800',
      'contract_deploy': 'bg-purple-100 text-purple-800',
      'other': 'bg-gray-100 text-gray-800'
    }
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  const getFeeColor = (category: string) => {
    const colors = {
      'free': 'bg-green-100 text-green-800',
      'low': 'bg-blue-100 text-blue-800',
      'medium': 'bg-yellow-100 text-yellow-800',
      'high': 'bg-orange-100 text-orange-800',
      'very_high': 'bg-red-100 text-red-800'
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
            <div className="text-red-500 text-xl mb-4">Error loading transaction data</div>
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
                Transaction Analytics
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Blockchain transaction patterns and categorization insights
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
                Transaction Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              >
                <option value="">All Types</option>
                <option value="contract_call">Contract Call</option>
                <option value="contract_deploy">Contract Deploy</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              >
                <option value="">All Status</option>
                <option value="successful">Successful</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Fee Category
              </label>
              <select
                value={feeFilter}
                onChange={(e) => setFeeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              >
                <option value="">All Fees</option>
                <option value="free">Free</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="very_high">Very High</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Search
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search hash or description..."
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
                {data.summary.total_transactions.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Transactions</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-green-600 mb-2">
                {Math.round(data.summary.success_rate_percent)}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Success Rate</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-purple-600 mb-2">
                {formatFee(data.summary.avg_fee)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Average Fee</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-orange-600 mb-2">
                {data.summary.avg_operations_per_tx}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Avg Operations/Tx</div>
            </motion.div>
          </div>
        )}

        {/* Transaction Type Breakdown */}
        {data?.transaction_types && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Transaction Type Distribution
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {data.transaction_types.map((type) => (
                <div key={type.transaction_type} className="text-center">
                  <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium mb-2 ${getTypeColor(type.transaction_type)}`}>
                    {type.transaction_type.replace('_', ' ')}
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {type.percentage}%
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {type.count.toLocaleString()} txs
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {Math.round(type.success_rate)}% success
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transactions Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Transactions ({filteredData.length} results)
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Transaction
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Fee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Operations
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredData.map((tx, index) => {
                  const contractCall = parseContractCall(tx.description)
                  const isExpanded = expandedRows.has(tx.tx_hash)
                  
                  return (
                    <React.Fragment key={`${tx.tx_hash}-${index}`}>
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <td className="px-6 py-4 w-8">
                          {contractCall.isContractCall && (
                            <button
                              onClick={() => toggleRowExpansion(tx.tx_hash)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                              <svg
                                className={`h-4 w-4 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            {contractCall.isContractCall ? (
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  <span className="font-medium">{contractCall.contractName}</span>
                                  <span className="text-gray-400 mx-1">::</span>
                                  <span className="text-blue-600 dark:text-blue-400">{contractCall.functionName}</span>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono font-light mt-1">
                                  {tx.tx_hash}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white font-mono">
                                  {tx.tx_hash}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {tx.description}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(tx.transaction_type)}`}>
                            {tx.transaction_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-white">
                            {formatFee(tx.fee)}
                          </div>
                          <div className={`text-xs px-2 py-1 rounded-full inline-flex ${getFeeColor(tx.fee_category)}`}>
                            {tx.fee_category}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {tx.operation_count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${tx.success ? 'text-green-800 bg-green-100' : 'text-red-800 bg-red-100'
                            }`}>
                            {tx.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatTime(tx.created_at)}
                        </td>
                      </motion.tr>
                      
                      {isExpanded && contractCall.isContractCall && (
                        <motion.tr
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-gray-50 dark:bg-gray-700"
                        >
                          <td></td>
                          <td colSpan={6} className="px-6 py-4">
                            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                              <div className="mb-3">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Contract Details</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400">Contract Address:</span>
                                    <div className="font-mono text-gray-900 dark:text-white mt-1">{contractCall.contractAddress}</div>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400">Contract Name:</span>
                                    <div className="font-mono text-gray-900 dark:text-white mt-1">{contractCall.contractName}</div>
                                  </div>
                                </div>
                              </div>
                              
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Function Arguments</h4>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 min-h-80 overflow-y-auto">
                                  <div className="font-mono text-xs">
                                    <div className="text-blue-600 dark:text-blue-400 mb-2">{contractCall.functionName}(</div>
                                    {contractCall.args?.map((arg, argIndex) => (
                                      <div key={argIndex} className="ml-4 text-gray-700 dark:text-gray-300">
                                        <span className="text-gray-500 dark:text-gray-400">{argIndex + 1}:</span> {arg}
                                        {argIndex < (contractCall.args?.length || 0) - 1 && ','}
                                      </div>
                                    ))}
                                    <div className="text-blue-600 dark:text-blue-400">)</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </motion.tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filteredData.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No transactions found for the selected filters.
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