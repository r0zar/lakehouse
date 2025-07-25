'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from '@monaco-editor/react';

interface Contract {
  contract_address: string;
  transaction_count: number;
  last_seen: string | { value: string };
  status: string;
  source_code?: string;
  parsed_abi?: string;
  created_at?: string;
  updated_at?: string;
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
  const [activeTab, setActiveTab] = useState<'overview' | 'source' | 'abi' | 'analysis'>('overview');
  
  // Extract contract name from address (format: deployer.contract-name)
  const parts = contract.contract_address.split('.');
  const deployer_address = parts.length > 1 ? parts[0] : '';
  const contract_name = parts.length > 1 ? parts[1] : contract.contract_address;
  
  // Parse ABI if available
  let parsedAbi = null;
  try {
    if (contract.parsed_abi) {
      parsedAbi = typeof contract.parsed_abi === 'string' ? JSON.parse(contract.parsed_abi) : contract.parsed_abi;
    }
  } catch (error) {
    console.warn('Failed to parse ABI:', error);
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'source', label: 'Source Code', icon: '💻', available: !!contract.source_code },
    { id: 'abi', label: 'ABI', icon: '🔧', available: !!parsedAbi },
    { id: 'analysis', label: 'Analysis', icon: '🔍' }
  ];

  const formatDate = (dateString: string | { value: string } | undefined) => {
    if (!dateString) return 'N/A';
    const date = typeof dateString === 'object' && dateString?.value ? dateString.value : dateString;
    return new Date(date as string).toLocaleString();
  };

  const truncateAddress = (address: string) => {
    return `${address.substring(0, 12)}...${address.substring(address.length - 8)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'discovered': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'analyzed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contract Information */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Contract Information
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Contract Name</label>
                  <p className="text-gray-900 dark:text-white font-mono">{contract_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Deployer Address</label>
                  <p className="text-gray-900 dark:text-white font-mono" title={deployer_address}>
                    {truncateAddress(deployer_address)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Full Address</label>
                  <p className="text-gray-900 dark:text-white font-mono text-sm break-all">{contract.contract_address}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</label>
                  <div>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(contract.status)}`}>
                      {contract.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Usage Metrics */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Usage Metrics
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Transaction Count</label>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {contract.transaction_count.toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Activity</label>
                  <p className="text-gray-900 dark:text-white">{formatDate(contract.last_seen)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</label>
                  <p className="text-gray-900 dark:text-white">{formatDate(contract.created_at)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Updated</label>
                  <p className="text-gray-900 dark:text-white">{formatDate(contract.updated_at)}</p>
                </div>
              </div>
            </div>

            {/* Source Code Summary */}
            {contract.source_code && (
              <div className="md:col-span-2 space-y-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                  Source Code Summary
                </h4>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Source Code Length
                    </span>
                    <span className="text-sm text-gray-900 dark:text-white">
                      {contract.source_code.length.toLocaleString()} characters
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300 font-mono bg-white dark:bg-gray-900 rounded p-3 max-h-32 overflow-y-auto">
                    {contract.source_code.substring(0, 200)}
                    {contract.source_code.length > 200 && '...'}
                  </div>
                  <button
                    onClick={() => setActiveTab('source')}
                    className="mt-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                  >
                    View Full Source Code →
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case 'source':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                Source Code ({contract.source_code?.length.toLocaleString()} characters)
              </h4>
            </div>
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              <Editor
                height="600px"
                defaultLanguage="lisp"
                value={contract.source_code || '// No source code available'}
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

      case 'abi':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                Application Binary Interface (ABI)
              </h4>
              {parsedAbi && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {parsedAbi.functions?.length || 0} functions
                </span>
              )}
            </div>
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              <Editor
                height="600px"
                defaultLanguage="json"
                value={parsedAbi ? JSON.stringify(parsedAbi, null, 2) : '// No ABI available'}
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

      case 'analysis':
        return (
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
              Contract Analysis
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-2">Analysis Status</h5>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(contract.status)}`}>
                  {contract.status}
                </span>
              </div>
              
              {parsedAbi && (
                <>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-white mb-2">Functions</h5>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {parsedAbi.functions?.length || 0}
                    </p>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-white mb-2">Maps</h5>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {parsedAbi.maps?.length || 0}
                    </p>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <h5 className="font-medium text-gray-900 dark:text-white mb-2">Variables</h5>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {parsedAbi.variables?.length || 0}
                    </p>
                  </div>
                </>
              )}
            </div>
            
            {parsedAbi?.functions && parsedAbi.functions.length > 0 && (
              <div className="mt-6">
                <h5 className="font-medium text-gray-900 dark:text-white mb-3">
                  Function List ({parsedAbi.functions.length} functions)
                </h5>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto">
                  {parsedAbi.functions.map((func: any, index: number) => (
                    <div key={`${func.name}-${index}`} className="p-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-gray-900 dark:text-white">{func.name}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          func.access === 'public' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          func.access === 'private' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                          'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        }`}>
                          {func.access || 'read_only'}
                        </span>
                      </div>
                      {func.args && func.args.length > 0 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Args: {func.args.length}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
      <td colSpan={5} className="p-0">
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

  const formatDate = (dateString: string | { value: string }) => {
    const date = typeof dateString === 'object' && dateString?.value ? dateString.value : dateString;
    return new Date(date as string).toLocaleString();
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
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
                              {(() => {
                                const parts = contract.contract_address.split('.');
                                return parts.length > 1 ? parts[1] : contract.contract_address;
                              })()}
                            </div>
                            <div className="text-xs font-mono text-gray-500 dark:text-gray-400">
                              {(() => {
                                const parts = contract.contract_address.split('.');
                                return parts.length > 1 ? `${parts[0].substring(0, 8)}...${parts[0].substring(parts[0].length - 4)}` : 'N/A';
                              })()}
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
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col items-start space-y-1">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              contract.status.toLowerCase() === 'discovered' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                              contract.status.toLowerCase() === 'analyzed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                              contract.status.toLowerCase() === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                            }`}>
                              {contract.status}
                            </span>
                            <div className="flex space-x-1">
                              {contract.source_code && (
                                <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1 py-0.5 rounded" title="Source code available">
                                  💻
                                </span>
                              )}
                              {contract.parsed_abi && (
                                <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-1 py-0.5 rounded" title="ABI available">
                                  🔧
                                </span>
                              )}
                            </div>
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