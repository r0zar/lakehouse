'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Token {
  contract_address: string;
  deployer_address: string;
  contract_name: string;
  token_type: string;
  sip010_function_count: number;
  has_minimum_token_functions: boolean;
  token_name: string | null;
  token_symbol: string | null;
  decimals: number | null;
  total_supply: string | null;
  token_uri: string | null;
  image_url: string | null;
  description: string | null;
  validation_status: string;
  validation_errors: string[] | null;
  validated_at: string | null;
  transaction_count: number;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

interface TokensResponse {
  data: Token[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    has_more: boolean;
  };
  filters: {
    search: string | null;
    token_type: string | null;
    validation_status: string | null;
  };
  statistics: {
    total_tokens: number;
    sip010_tokens: number;
    partial_tokens: number;
    validated_tokens: number;
    pending_tokens: number;
    failed_tokens: number;
    avg_sip010_functions: number;
    avg_transaction_count: number;
  };
}

interface ExpandedRowProps {
  token: Token;
}

function ExpandedRow({ token }: ExpandedRowProps) {
  const tokenDetails = {
    token_metadata: {
      name: token.token_name,
      symbol: token.token_symbol,
      decimals: token.decimals,
      total_supply: token.total_supply,
      token_uri: token.token_uri,
      image_url: token.image_url,
      description: token.description,
    },
    sip010_analysis: {
      token_type: token.token_type,
      sip010_function_count: token.sip010_function_count,
      has_minimum_token_functions: token.has_minimum_token_functions,
    },
    validation_info: {
      validation_status: token.validation_status,
      validation_errors: token.validation_errors,
      validated_at: token.validated_at,
    },
    contract_info: {
      contract_address: token.contract_address,
      deployer_address: token.deployer_address,
      contract_name: token.contract_name,
      transaction_count: token.transaction_count,
      last_seen: token.last_seen,
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
      <td colSpan={6} className="p-6">
        <motion.div
          className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Token Image and Basic Info */}
            <div className="space-y-4">
              {token.image_url && (
                <div className="flex items-center space-x-4">
                  <img 
                    src={token.image_url} 
                    alt={token.token_name || 'Token'} 
                    className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {token.token_name || token.contract_name}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {token.token_symbol}
                    </p>
                  </div>
                </div>
              )}
              
              {token.description && (
                <div>
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{token.description}</p>
                </div>
              )}
            </div>

            {/* Detailed JSON */}
            <div>
              <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Token Details</h5>
              <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto bg-gray-50 dark:bg-gray-900 p-3 rounded">
                {JSON.stringify(tokenDetails, null, 2)}
              </pre>
            </div>
          </div>
        </motion.div>
      </td>
    </motion.tr>
  );
}

export default function TokensPage() {
  const [tokensData, setTokensData] = useState<TokensResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [tokenTypeFilter, setTokenTypeFilter] = useState('');
  const [validationStatusFilter, setValidationStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchTokens = async (page: number = 1) => {
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
      if (tokenTypeFilter) params.set('token_type', tokenTypeFilter);
      if (validationStatusFilter) params.set('validation_status', validationStatusFilter);
      
      const response = await fetch(`/api/tokens?${params}`, {
        headers: {
          'x-api-key': 'debug_lakehouse_2025_secure_key'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data: TokensResponse = await response.json();
      setTokensData(data);
      setCurrentPage(page);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens(1);
  }, [search, tokenTypeFilter, validationStatusFilter]);

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

  const getTokenTypeColor = (tokenType: string) => {
    switch (tokenType) {
      case 'sip010_token':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'partial_token':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getValidationStatusColor = (status: string) => {
    switch (status) {
      case 'validated':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'pending':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && tokensData && page <= Math.ceil(tokensData.pagination.total / tokensData.pagination.limit)) {
      fetchTokens(page);
      setExpandedRow(null);
    }
  };

  if (loading && !tokensData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading tokens...</p>
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
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Failed to Load Tokens</h3>
          <p className="text-gray-600 dark:text-gray-300 mb-4">{error}</p>
          <button
            onClick={() => fetchTokens(currentPage)}
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
                Token Discovery
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                SIP-010 tokens discovered and validated from smart contract analysis
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

          {/* Statistics */}
          {tokensData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatNumber(tokensData.statistics.sip010_tokens)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">SIP-010 Tokens</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatNumber(tokensData.statistics.validated_tokens)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Validated</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {formatNumber(tokensData.statistics.partial_tokens)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Partial Tokens</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {tokensData.statistics.avg_sip010_functions.toFixed(1)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Avg SIP-010 Functions</div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
            <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search tokens, symbols, addresses..."
                className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 px-3 py-2 rounded focus:ring-blue-500 focus:border-blue-500 flex-1 min-w-0 text-sm"
              />
              
              <select
                value={tokenTypeFilter}
                onChange={(e) => setTokenTypeFilter(e.target.value)}
                className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 px-3 py-2 rounded focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">All Types</option>
                <option value="sip010_token">SIP-010 Tokens</option>
                <option value="partial_token">Partial Tokens</option>
              </select>
              
              <select
                value={validationStatusFilter}
                onChange={(e) => setValidationStatusFilter(e.target.value)}
                className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 px-3 py-2 rounded focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">All Status</option>
                <option value="validated">Validated</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
              
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors text-sm"
              >
                Search
              </button>
              
              {(search || tokenTypeFilter || validationStatusFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setSearchInput('');
                    setTokenTypeFilter('');
                    setValidationStatusFilter('');
                    setCurrentPage(1);
                  }}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors text-sm"
                >
                  Clear
                </button>
              )}
            </form>
          </div>

          {tokensData && (
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <div>
                Showing {tokensData.pagination.offset + 1}-{Math.min(tokensData.pagination.offset + tokensData.pagination.limit, tokensData.pagination.total)} of {formatNumber(tokensData.pagination.total)} tokens
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
                    Token
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    SIP-010 Functions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Transactions
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <AnimatePresence>
                  {tokensData?.data.map((token) => (
                    <React.Fragment key={token.contract_address}>
                      <motion.tr
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => toggleExpanded(token.contract_address)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-3">
                            {token.image_url && (
                              <img 
                                src={token.image_url} 
                                alt={token.token_name || 'Token'} 
                                className="w-8 h-8 rounded-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {token.token_name || token.contract_name}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {token.token_symbol}
                              </div>
                              <div className="text-xs font-mono text-gray-400 dark:text-gray-500">
                                {token.contract_address}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTokenTypeColor(token.token_type)}`}>
                            {token.token_type.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm font-mono text-gray-900 dark:text-gray-100">
                            {token.sip010_function_count}/7
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getValidationStatusColor(token.validation_status)}`}>
                            {token.validation_status.charAt(0).toUpperCase() + token.validation_status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="text-sm font-mono text-gray-900 dark:text-gray-100">
                            {formatNumber(token.transaction_count)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <motion.button
                            className="text-blue-600 hover:text-blue-900 dark:hover:text-blue-400 transition-colors"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {expandedRow === token.contract_address ? (
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
                      
                      {expandedRow === token.contract_address && (
                        <ExpandedRow token={token} />
                      )}
                    </React.Fragment>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {tokensData && Math.ceil(tokensData.pagination.total / tokensData.pagination.limit) > 1 && (
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
                    Page {currentPage} of {Math.ceil(tokensData.pagination.total / tokensData.pagination.limit)}
                  </span>
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={!tokensData.pagination.has_more}
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