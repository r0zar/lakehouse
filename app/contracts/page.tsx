'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Contract {
  contract_address: string;
  deployer_address: string;
  contract_name: string;
  transaction_count: number;
  last_seen: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ContractsResponse {
  data: Contract[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    has_more: boolean;
  };
  filters: {
    search: string | null;
  };
}

interface ExpandedRowProps {
  contract: Contract;
}

function ExpandedRow({ contract }: ExpandedRowProps) {
  const contractDetails = {
    contract_info: {
      contract_address: contract.contract_address,
      deployer_address: contract.deployer_address,
      contract_name: contract.contract_name,
      status: contract.status,
    },
    usage_metrics: {
      transaction_count: contract.transaction_count,
      last_seen: contract.last_seen,
    },
    metadata: {
      created_at: contract.created_at,
      updated_at: contract.updated_at,
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
      <td colSpan={4} className="p-6">
        <motion.div
          className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <pre className="text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">
            {JSON.stringify(contractDetails, null, 2)}
          </pre>
        </motion.div>
      </td>
    </motion.tr>
  );
}

export default function ContractsPage() {
  const [contractsData, setContractsData] = useState<ContractsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchContracts = async (page: number = 1) => {
    setLoading(true);
    setError(null);
    
    try {
      const limit = 50;
      const offset = (page - 1) * limit;
      
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });
      
      if (search) params.set('search', search);
      
      const response = await fetch(`/api/contracts?${params}`, {
        headers: {
          'x-api-key': 'debug_lakehouse_2025_secure_key'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data: ContractsResponse = await response.json();
      setContractsData(data);
      setCurrentPage(page);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts(1);
  }, [search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setCurrentPage(1);
  };

  const toggleExpanded = (contractAddress: string) => {
    setExpandedRow(expandedRow === contractAddress ? null : contractAddress);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const truncateAddress = (address: string) => {
    return `${address.substring(0, 8)}...${address.substring(address.length - 4)}`;
  };

  const goToPage = (page: number) => {
    if (page >= 1 && contractsData && page <= Math.ceil(contractsData.pagination.total / contractsData.pagination.limit)) {
      fetchContracts(page);
      setExpandedRow(null);
    }
  };

  if (loading && !contractsData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading contracts...</p>
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
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Failed to Load Contracts</h3>
          <p className="text-gray-600 dark:text-gray-300 mb-4">{error}</p>
          <button
            onClick={() => fetchContracts(currentPage)}
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
                Contract Discovery
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Discovered smart contracts from blockchain transaction analysis
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

          {/* Filters */}
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
            <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search contract addresses..."
                className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 px-3 py-2 rounded focus:ring-blue-500 focus:border-blue-500 flex-1 text-sm"
              />
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors text-sm"
              >
                Search
              </button>
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setSearchInput('');
                    setCurrentPage(1);
                  }}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors text-sm"
                >
                  Clear
                </button>
              )}
            </form>
          </div>

          {contractsData && (
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <div>
                Showing {contractsData.pagination.offset + 1}-{Math.min(contractsData.pagination.offset + contractsData.pagination.limit, contractsData.pagination.total)} of {formatNumber(contractsData.pagination.total)} contracts
                {search && ` (filtered by "${search}")`}
              </div>
            </div>
          )}
        </header>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Contract Address
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Transactions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Last Seen
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <AnimatePresence>
                  {contractsData?.data.map((contract) => (
                    <React.Fragment key={contract.contract_address}>
                      <motion.tr
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => toggleExpanded(contract.contract_address)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <div className="text-sm font-mono text-gray-900 dark:text-gray-100">
                              {contract.contract_address}
                            </div>
                            <div className="text-xs font-mono text-gray-500 dark:text-gray-400">
                              {contract.deployer_address}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="text-sm font-mono text-gray-900 dark:text-gray-100">
                            {formatNumber(contract.transaction_count)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {formatDate(contract.last_seen)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <motion.button
                            className="text-blue-600 hover:text-blue-900 dark:hover:text-blue-400 transition-colors"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {expandedRow === contract.contract_address ? (
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
                      
                      {expandedRow === contract.contract_address && (
                        <ExpandedRow contract={contract} />
                      )}
                    </React.Fragment>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {contractsData && Math.ceil(contractsData.pagination.total / contractsData.pagination.limit) > 1 && (
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Page {currentPage} of {Math.ceil(contractsData.pagination.total / contractsData.pagination.limit)}
                  </span>
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={!contractsData.pagination.has_more}
                    className="px-3 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}