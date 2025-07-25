'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from '@monaco-editor/react';

interface Token {
  contract_address: string;
  token_type: string;
  token_name: string | null;
  token_symbol: string | null;
  decimals: number | null;
  total_supply: string | null;
  token_uri: string | null;
  image_url: string | null;
  description: string | null;
  transaction_count: number;
  last_seen: string | { value: string };
  validation_status: string;
  created_at?: string | { value: string };
  updated_at?: string | { value: string };
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
}

interface ExpandedRowProps {
  token: Token;
}

function ExpandedRow({ token }: ExpandedRowProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'metadata' | 'uri' | 'validation'>('overview');
  
  // Extract contract name from address (format: deployer.contract-name)
  const parts = token.contract_address.split('.');
  const deployer_address = parts.length > 1 ? parts[0] : '';
  const contract_name = parts.length > 1 ? parts[1] : token.contract_address;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'metadata', label: 'Metadata', icon: '🏷️' },
    { id: 'uri', label: 'Token URI', icon: '🔗', available: !!token.token_uri },
    { id: 'validation', label: 'Validation', icon: '✅' }
  ];

  const formatDate = (dateString: string | { value: string } | undefined) => {
    if (!dateString) return 'N/A';
    const date = typeof dateString === 'object' && dateString?.value ? dateString.value : dateString;
    return new Date(date as string).toLocaleString();
  };

  const truncateAddress = (address: string) => {
    return `${address.substring(0, 12)}...${address.substring(address.length - 8)}`;
  };

  const getValidationStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const getTokenTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'sip010_token': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'partial_token': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const formatSupply = (supply: string | null, decimals: number | null) => {
    if (!supply || !decimals) return supply || 'Unknown';
    try {
      const num = parseFloat(supply);
      const formatted = num / Math.pow(10, decimals);
      return formatted.toLocaleString(undefined, { maximumFractionDigits: Math.min(decimals, 6) });
    } catch {
      return supply;
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Token Information */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Token Information
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Token Name</label>
                  <p className="text-gray-900 dark:text-white font-mono">{token.token_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Symbol</label>
                  <p className="text-gray-900 dark:text-white font-mono">{token.token_symbol || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Type</label>
                  <div>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTokenTypeColor(token.token_type)}`}>
                      {token.token_type}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Contract Address</label>
                  <p className="text-gray-900 dark:text-white font-mono text-sm break-all">{token.contract_address}</p>
                </div>
              </div>
            </div>

            {/* Token Metrics */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Token Metrics
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Decimals</label>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {token.decimals ?? 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Supply</label>
                  <p className="text-gray-900 dark:text-white">
                    {token.total_supply ? formatSupply(token.total_supply, token.decimals) : 'N/A'}
                    {token.token_symbol && ` ${token.token_symbol}`}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Transaction Count</label>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {token.transaction_count.toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Activity</label>
                  <p className="text-gray-900 dark:text-white">{formatDate(token.last_seen)}</p>
                </div>
              </div>
            </div>

            {/* Token Image */}
            {token.image_url && (
              <div className="md:col-span-2 space-y-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                  Token Image
                </h4>
                <div className="flex items-center space-x-4">
                  <img 
                    src={token.image_url} 
                    alt={token.token_name || 'Token'} 
                    className="w-24 h-24 rounded-lg object-cover border border-gray-200 dark:border-gray-600"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Image URL:</p>
                    <a 
                      href={token.image_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-mono break-all"
                    >
                      {token.image_url}
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'metadata':
        return (
          <div className="space-y-6">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
              Token Metadata
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-3">Basic Information</h5>
                <div className="space-y-2 text-sm">
                  <div><strong>Name:</strong> {token.token_name || 'Not specified'}</div>
                  <div><strong>Symbol:</strong> {token.token_symbol || 'Not specified'}</div>
                  <div><strong>Decimals:</strong> {token.decimals ?? 'Not specified'}</div>
                  <div><strong>Type:</strong> {token.token_type}</div>
                </div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-3">Supply Information</h5>
                <div className="space-y-2 text-sm">
                  <div><strong>Total Supply (Raw):</strong> {token.total_supply || 'Not specified'}</div>
                  <div><strong>Total Supply (Formatted):</strong> {token.total_supply ? formatSupply(token.total_supply, token.decimals) : 'Not specified'}</div>
                  <div><strong>Transaction Count:</strong> {token.transaction_count.toLocaleString()}</div>
                </div>
              </div>
            </div>
            
            {token.description && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-3">Description</h5>
                <p className="text-gray-700 dark:text-gray-300 text-sm">{token.description}</p>
              </div>
            )}
          </div>
        );

      case 'uri':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                Token URI Data
              </h4>
              {token.token_uri && (
                <a 
                  href={token.token_uri} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm"
                >
                  Open URI →
                </a>
              )}
            </div>
            {token.token_uri ? (
              <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                <Editor
                  height="400px"
                  defaultLanguage="json"
                  value={`{
  "token_uri": "${token.token_uri}",
  "image_url": "${token.image_url || 'Not specified'}",
  "description": "${token.description || 'Not specified'}",
  "external_url": "Visit the token URI to see full metadata"
}`}
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
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No Token URI available for this token
              </div>
            )}
          </div>
        );

      case 'validation':
        return (
          <div className="space-y-6">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
              Token Validation Status
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-2">Validation Status</h5>
                <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getValidationStatusColor(token.validation_status)}`}>
                  {token.validation_status}
                </span>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-2">Token Type</h5>
                <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getTokenTypeColor(token.token_type)}`}>
                  {token.token_type}
                </span>
              </div>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h5 className="font-medium text-gray-900 dark:text-white mb-3">Timestamps</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Created:</strong> {formatDate(token.created_at)}
                </div>
                <div>
                  <strong>Last Updated:</strong> {formatDate(token.updated_at)}
                </div>
                <div>
                  <strong>Last Activity:</strong> {formatDate(token.last_seen)}
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
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
      <td colSpan={6} className="p-0">
        <motion.div
          className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
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
                    Decimals
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
                                {token.token_name || (() => {
                                  const parts = token.contract_address.split('.');
                                  return parts.length > 1 ? parts[1] : token.contract_address;
                                })()}
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
                            {token.decimals ?? 'N/A'}
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