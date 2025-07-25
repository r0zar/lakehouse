'use client'

import React, { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { motion, AnimatePresence } from 'framer-motion'

interface AddressOperation {
  event_id: string;
  block_hash: string;
  tx_hash: string;
  operation_type: string;
  address: string;
  amount: string | null;
  contract_identifier: string | null;
  function_name: string | null;
  function_args: any[] | null;
  webhook_path: string;
  received_at: string;
}

interface AddressesResponse {
  operations: AddressOperation[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface ExpandedRowProps {
  operation: AddressOperation;
}

function ExpandedRow({ operation }: ExpandedRowProps) {
  // Clean up function arguments by removing extra quotes
  const cleanFunctionArgs = operation.function_args?.map(arg => {
    try {
      // If it's a JSON string, parse it to remove quotes
      return typeof arg === 'string' && arg.startsWith('"') && arg.endsWith('"')
        ? JSON.parse(arg)
        : arg;
    } catch {
      return arg; // Return as-is if parsing fails
    }
  }) || null;

  const operationDetails = {
    identifiers: {
      event_id: operation.event_id,
      tx_hash: operation.tx_hash,
      block_hash: operation.block_hash,
    },
    operation_data: {
      operation_type: operation.operation_type,
      address: operation.address,
      amount: operation.amount,
    },
    contract_interaction: operation.contract_identifier ? {
      contract_identifier: operation.contract_identifier,
      function_name: operation.function_name,
      function_args: cleanFunctionArgs,
    } : null,
    metadata: {
      webhook_path: operation.webhook_path,
      received_at: operation.received_at,
    }
  };

  return (
    <motion.tr
      className="bg-gray-50 dark:bg-gray-900"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      <td colSpan={7} className="p-0">
        <motion.div
          className="border border-gray-300 dark:border-gray-600 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <Editor
            height="400px"
            defaultLanguage="json"
            value={JSON.stringify(operationDetails, null, 2)}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              fontSize: 12,
              folding: true,
              lineNumbers: 'on',
              glyphMargin: false,
              lineDecorationsWidth: 0,
              lineNumbersMinChars: 3
            }}
          />
        </motion.div>
      </td>
    </motion.tr>
  );
}

export default function AddressesPage() {
  const [addressesData, setAddressesData] = useState<AddressesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchAddresses = async (page: number = 1) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/addresses?page=${page}&limit=50`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch address operations');
      }

      setAddressesData(data);
      setCurrentPage(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch address operations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses(1);

    // Auto-refresh every 30 seconds, but only for page 1 to show latest operations
    const interval = setInterval(() => {
      if (currentPage === 1) {
        fetchAddresses(1);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [currentPage]);

  const toggleExpanded = (operationKey: string) => {
    setExpandedRow(expandedRow === operationKey ? null : operationKey);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const truncateHash = (hash: string | null) => {
    if (!hash) return 'N/A';
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 4)}`;
  };

  const truncateAddress = (address: string) => {
    if (!address) return 'N/A';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const formatAmount = (amount: string | null) => {
    if (!amount) return 'N/A';
    try {
      const num = parseFloat(amount);
      return num.toLocaleString();
    } catch {
      return amount;
    }
  };

  const getOperationTypeColor = (operationType: string) => {
    switch (operationType) {
      case 'credit':
        return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
      case 'debit':
        return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
      case 'contract_call':
        return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
      case 'token_transfer':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && (!addressesData || page <= Math.ceil(addressesData.totalCount / addressesData.limit))) {
      fetchAddresses(page);
      setExpandedRow(null); // Close any expanded rows when changing pages
    }
  };

  if (loading && !addressesData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading address operations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Failed to Load Address Operations</h3>
          <p className="text-gray-600 dark:text-gray-300 mb-4">{error}</p>
          <button
            onClick={() => fetchAddresses(currentPage)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-8">
      <div className="container mx-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Address Operations
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Blockchain address operations including credits, debits, and contract interactions
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

          {addressesData && (
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <div>
                Showing {((addressesData.page - 1) * addressesData.limit) + 1}-{Math.min(addressesData.page * addressesData.limit, addressesData.totalCount)} of {addressesData.totalCount.toLocaleString()} operations
              </div>
              <div>
                {currentPage === 1 && 'Auto-refreshes every 30 seconds'}
              </div>
            </div>
          )}
        </header>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Operation Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Contract
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Function
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    TX Hash
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {addressesData?.operations.map((operation, index) => {
                  const operationKey = `${operation.tx_hash}-${operation.address}-${index}`;
                  return (
                    <React.Fragment key={operationKey}>
                      <motion.tr
                        className="hover:bg-gray-50 dark:hover:bg-gray-700"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                          <motion.span
                            className={`px-2 py-1 rounded-full text-xs font-medium inline-block ${getOperationTypeColor(operation.operation_type)}`}
                            whileHover={{ scale: 1.05 }}
                            transition={{ duration: 0.2 }}
                          >
                            {operation.operation_type.replace('_', ' ')}
                          </motion.span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-300">
                          <motion.span
                            className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded text-xs font-medium inline-block"
                            whileHover={{ scale: 1.05 }}
                            transition={{ duration: 0.2 }}
                          >
                            {truncateAddress(operation.address)}
                          </motion.span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {operation.amount ? (
                            <motion.span
                              className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-full text-xs font-medium inline-block"
                              whileHover={{ scale: 1.05 }}
                              transition={{ duration: 0.2 }}
                            >
                              {formatAmount(operation.amount)}
                            </motion.span>
                          ) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-300">
                          {operation.contract_identifier ? (
                            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded text-xs">
                              {operation.contract_identifier.split('.').pop()}
                            </span>
                          ) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {operation.function_name ? (
                            <motion.span
                              className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-xs font-medium inline-block"
                              whileHover={{ scale: 1.05 }}
                              transition={{ duration: 0.2 }}
                            >
                              {operation.function_name}
                            </motion.span>
                          ) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-300">
                          {truncateHash(operation.tx_hash)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <motion.button
                            onClick={() => toggleExpanded(operationKey)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                          >
                            <motion.svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              animate={{ rotate: expandedRow === operationKey ? 180 : 0 }}
                              transition={{ duration: 0.3 }}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </motion.svg>
                            {expandedRow === operationKey ? 'Collapse' : 'Expand'}
                          </motion.button>
                        </td>
                      </motion.tr>
                      <AnimatePresence>
                        {expandedRow === operationKey && <ExpandedRow operation={operation} />}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {addressesData && (
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                Page {currentPage} of {Math.ceil(addressesData.totalCount / addressesData.limit)}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={!addressesData.hasMore || loading}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>

            {loading && (
              <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                Loading...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}