import { Copy, Code, FileText, Zap, Shield, Database, TrendingUp, Calendar, Users, Coins } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { generateContractAnalysis } from '@/lib/analysis-engine';
import { AnalysisSummary } from './AnalysisSummary';

interface ContractInterface {
  interface: string;
  metadata: any;
  is_verified: boolean;
}

interface ContractTokenActivity {
  token_contract_id: string;
  token_symbol: string;
  token_name?: string;
  display_symbol?: string;
  token_image?: string;
  transaction_count: number;
  inbound_tokens: number;
  outbound_tokens: number;
  inbound_usd: number;
  outbound_usd: number;
  avg_tokens_per_tx: number;
  avg_usd_per_tx: number;
  current_price: number;
}

interface ContractDetails {
  type: 'contract';
  address: string;
  contract_address: string;
  contract_name: string;
  abi: any;
  source_code?: string;
  created_at?: string;
  interfaces: ContractInterface[];
  recent_interactions: number;
  avg_usd_per_interaction: number;
  avg_interactions_per_day: number;
  earliest_transaction?: string;
  latest_transaction?: string;
  recent_users: number;
  active_tokens: number;
  token_activity: ContractTokenActivity[];
}

interface ContractDetailsViewProps {
  details: ContractDetails;
}

export const ContractDetailsView: React.FC<ContractDetailsViewProps> = ({ details }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'tokens' | 'abi' | 'source' | 'interfaces'>('overview');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Safely extract values from BigQuery complex objects
  const safeValue = (value: any): any => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object' && 'value' in value) return value.value;
    if (typeof value === 'object' && 'response' in value) return null; // Skip complex response objects
    if (typeof value === 'object' && 'tuple' in value) return null; // Skip complex tuple objects
    return value;
  };

  const safeString = (value: any): string => {
    const safe = safeValue(value);
    if (safe === null || safe === undefined) return '';
    return String(safe);
  };

  const safeNumber = (value: any): number => {
    const safe = safeValue(value);
    return Number(safe || 0);
  };

  // Safely render complex type objects for ABI display
  const renderType = (type: any): string => {
    if (!type) return 'unknown';
    
    if (typeof type === 'string') {
      return type;
    }
    
    if (typeof type === 'object') {
      // Handle tuple types
      if (type.tuple && Array.isArray(type.tuple)) {
        const fields = type.tuple.map((field: any) => 
          `${field.name}: ${renderType(field.type)}`
        ).join(', ');
        return `{${fields}}`;
      }
      
      // Handle list types
      if (type.list) {
        return `(list ${type.list.length || '?'} ${renderType(type.list.type || type.list)})`;
      }
      
      // Handle optional types
      if (type.optional) {
        return `(optional ${renderType(type.optional)})`;
      }
      
      // Handle response types
      if (type.response) {
        return `(response ${renderType(type.response.ok)} ${renderType(type.response.error)})`;
      }
      
      // Handle buffer types
      if (type.buffer) {
        return `(buff ${type.buffer.length || '?'})`;
      }
      
      // Handle string-ascii types
      if (type['string-ascii']) {
        return `(string-ascii ${type['string-ascii'].length || '?'})`;
      }
      
      // Handle string-utf8 types
      if (type['string-utf8']) {
        return `(string-utf8 ${type['string-utf8'].length || '?'})`;
      }
      
      // Fallback for other object types
      return JSON.stringify(type);
    }
    
    return String(type);
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1e9) return `${(volume / 1e9).toFixed(2)}B`;
    if (volume >= 1e6) return `${(volume / 1e6).toFixed(2)}M`;
    if (volume >= 1e3) return `${(volume / 1e3).toFixed(2)}K`;
    return volume.toFixed(2);
  };

  const getInterfaceIcon = (interfaceName: string) => {
    switch (interfaceName) {
      case 'sip-010-trait':
        return <Database className="text-green-400" size={16} />;
      case 'vault-trait':
        return <Shield className="text-blue-400" size={16} />;
      default:
        return <Zap className="text-purple-400" size={16} />;
    }
  };

  const getInterfaceColor = (interfaceName: string) => {
    switch (interfaceName) {
      case 'sip-010-trait':
        return 'border-green-500/30 bg-green-500/10';
      case 'vault-trait':
        return 'border-blue-500/30 bg-blue-500/10';
      default:
        return 'border-purple-500/30 bg-purple-500/10';
    }
  };

  const renderAbiFunction = (func: any, index: number) => (
    <div key={index} className="border border-gray-700 rounded p-3 bg-gray-800/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-cyan-300 font-mono font-medium">{safeString(func.name)}</span>
          <span className={`px-2 py-1 rounded text-xs ${
            safeString(func.access) === 'public' ? 'bg-green-600/20 text-green-300' :
            safeString(func.access) === 'read_only' ? 'bg-blue-600/20 text-blue-300' :
            'bg-gray-600/20 text-gray-300'
          }`}>
            {safeString(func.access)}
          </span>
        </div>
      </div>
      
      {func.args && Array.isArray(func.args) && func.args.length > 0 && (
        <div className="mb-2">
          <div className="text-sm text-gray-400 mb-1">Arguments:</div>
          <div className="space-y-1">
            {func.args.map((arg: any, argIndex: number) => (
              <div key={argIndex} className="text-sm font-mono text-gray-300">
                <span className="text-orange-300">{safeString(arg.name)}</span>: <span className="text-purple-300">{renderType(arg.type)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {func.outputs && (
        <div>
          <div className="text-sm text-gray-400 mb-1">Returns:</div>
          <div className="text-sm font-mono text-purple-300">{renderType(func.outputs.type || func.outputs)}</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-black font-mono">
      {/* Tab Navigation */}
      <div className="flex border-b-2 border-[#00ff88]/30 bg-black/50">
        {[
          { id: 'overview', label: 'OVERVIEW', icon: <FileText size={16} /> },
          { id: 'tokens', label: 'TOKENS', icon: <Coins size={16} /> },
          { id: 'abi', label: 'ABI', icon: <Code size={16} /> },
          { id: 'source', label: 'SOURCE', icon: <FileText size={16} /> },
          { id: 'interfaces', label: 'INTERFACES', icon: <Shield size={16} /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center space-x-2 px-6 py-4 text-xs font-mono font-bold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === tab.id
                ? 'border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:bg-[#00ff88]/5'
            }`}
            style={activeTab === tab.id ? { boxShadow: '0 0 10px rgba(0,255,136,0.3)' } : {}}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <>
            {/* AI Analysis Summary */}
            <AnalysisSummary analysis={generateContractAnalysis(details)} />

            {/* Contract Identity */}
            <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4" 
                 style={{ boxShadow: '0 0 20px rgba(0,255,136,0.2), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-[#00ff88] text-xs uppercase tracking-wider font-bold border-b border-[#00ff88]/30 pb-2">
                  ◦ CONTRACT IDENTITY ◦
                </div>
                <button
                  onClick={() => copyToClipboard(details.address)}
                  className="text-gray-400 hover:text-[#00ff88] transition-colors p-2 hover:bg-[#00ff88]/10 rounded-none"
                  title="Copy full contract ID"
                >
                  <Copy size={16} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="bg-black/50 border border-[#00ff88]/20 p-3">
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">CONTRACT ADDRESS</div>
                  <div className="font-mono text-white">{details.contract_address}</div>
                </div>
                <div className="bg-black/50 border border-[#00ff88]/20 p-3">
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">CONTRACT NAME</div>
                  <div className="font-mono text-[#00ff88] text-lg font-bold">{details.contract_name}</div>
                </div>
                {safeString(details.created_at) && (
                  <div className="bg-black/50 border border-[#00ff88]/20 p-3">
                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">DEPLOYED</div>
                    <div className="text-[#00ff88] font-mono font-bold">
                      {formatDistanceToNow(new Date(safeString(details.created_at)))} ago
                    </div>
                    <div className="text-xs text-gray-500 font-mono mt-1 opacity-80">
                      {new Date(safeString(details.created_at)).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Usage Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4 hover:border-[#00ff88]/60 transition-all" 
                   style={{ boxShadow: '0 0 15px rgba(0,255,136,0.2)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-[#00ff88] font-mono">{safeNumber(details.avg_interactions_per_day).toFixed(1)}</div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">AVG INTERACTIONS / DAY</div>
                  </div>
                  <TrendingUp className="text-[#00ff88] opacity-70" size={24} />
                </div>
              </div>

              <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4 hover:border-[#00ff88]/60 transition-all" 
                   style={{ boxShadow: '0 0 15px rgba(0,255,136,0.2)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-[#00ff88] font-mono">${safeNumber(details.avg_usd_per_interaction).toFixed(2)}</div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">AVG USD / INTERACTION</div>
                  </div>
                  <Database className="text-[#00ff88] opacity-70" size={24} />
                </div>
              </div>

              <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4 hover:border-[#00ff88]/60 transition-all" 
                   style={{ boxShadow: '0 0 15px rgba(0,255,136,0.2)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-[#00ff88] font-mono">{safeNumber(details.recent_users).toLocaleString()}</div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">RECENT USERS</div>
                  </div>
                  <Users className="text-[#00ff88] opacity-70" size={24} />
                </div>
              </div>
            </div>

            {/* Activity Timeline */}
            {details.earliest_transaction && details.latest_transaction && (
              <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88] rounded-none p-4" 
                   style={{ boxShadow: '0 0 20px rgba(0,255,136,0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
                <div className="text-[#00ff88] text-xs uppercase tracking-wider font-bold border-b border-[#00ff88]/30 pb-2 mb-4">
                  ◦ ACTIVITY TIMELINE ◦
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-black/50 border border-[#00ff88]/20 p-4">
                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">FIRST USAGE</div>
                    <div className="text-[#00ff88] font-mono text-lg font-bold">
                      {formatDistanceToNow(new Date((details.earliest_transaction as any)?.value || details.earliest_transaction))} ago
                    </div>
                    <div className="text-xs text-gray-500 font-mono mt-1 opacity-80">
                      {new Date((details.earliest_transaction as any)?.value || details.earliest_transaction).toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-black/50 border border-[#00ff88]/20 p-4">
                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">LATEST USAGE</div>
                    <div className="text-[#00ff88] font-mono text-lg font-bold">
                      {formatDistanceToNow(new Date((details.latest_transaction as any)?.value || details.latest_transaction))} ago
                    </div>
                    <div className="text-xs text-gray-500 font-mono mt-1 opacity-80">
                      {new Date((details.latest_transaction as any)?.value || details.latest_transaction).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'tokens' && (
          <>
            {/* Token Activity */}
            {details.token_activity && details.token_activity.length > 0 ? (
              <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4" 
                   style={{ boxShadow: '0 0 20px rgba(0,255,136,0.2), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
                <div className="text-[#00ff88] text-xs uppercase tracking-wider font-bold border-b border-[#00ff88]/30 pb-2 mb-4">
                  ◦ TOKEN ACTIVITY ({details.recent_interactions} INTERACTIONS) ◦
                </div>
                <div className="overflow-x-auto">
                  <div className="bg-black/50 border border-[#00ff88]/20">
                    <div className="grid grid-cols-7 gap-3 py-3 px-4 border-b border-[#00ff88]/30 bg-black/30">
                      <div className="text-[#00ff88] font-mono text-xs uppercase tracking-wider">TOKEN</div>
                      <div className="text-[#00ff88] font-mono text-xs uppercase tracking-wider text-right">INBOUND</div>
                      <div className="text-[#00ff88] font-mono text-xs uppercase tracking-wider text-right">OUTBOUND</div>
                      <div className="text-[#00ff88] font-mono text-xs uppercase tracking-wider text-right">USD VALUE</div>
                      <div className="text-[#00ff88] font-mono text-xs uppercase tracking-wider text-right">AVG/TX</div>
                      <div className="text-[#00ff88] font-mono text-xs uppercase tracking-wider text-right">PRICE</div>
                      <div className="text-[#00ff88] font-mono text-xs uppercase tracking-wider text-right">TXS</div>
                    </div>
                    {details.token_activity.map((token, index) => (
                      <div key={index} className="grid grid-cols-7 gap-3 py-3 px-4 border-b border-[#00ff88]/10 hover:bg-[#00ff88]/5 transition-colors">
                        <div className="flex items-center space-x-2">
                          {safeString(token.token_image) && (
                            <img 
                              src={safeString(token.token_image)} 
                              alt={safeString(token.token_name) || safeString(token.token_symbol)}
                              className="w-4 h-4 rounded-full"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          )}
                          <div>
                            <div className="text-white font-mono text-sm font-bold">
                              {safeString(token.display_symbol) || safeString(token.token_symbol)}
                            </div>
                            {safeString(token.token_name) && safeString(token.token_name) !== safeString(token.token_symbol) && (
                              <div className="text-xs text-gray-400 truncate max-w-24">
                                {safeString(token.token_name)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-green-400 font-mono text-sm">
                            +{safeNumber(token.inbound_tokens).toFixed(2)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-red-400 font-mono text-sm">
                            -{safeNumber(token.outbound_tokens).toFixed(2)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[#00ff88] font-mono text-sm font-bold">
                            ${(safeNumber(token.inbound_usd) + safeNumber(token.outbound_usd)).toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-400">
                            +${safeNumber(token.inbound_usd).toFixed(2)} / -${safeNumber(token.outbound_usd).toFixed(2)}
                          </div>
                        </div>
                        <div className="text-right text-gray-300 font-mono text-sm">
                          ${safeNumber(token.avg_usd_per_tx).toFixed(2)}
                        </div>
                        <div className="text-right text-gray-400 font-mono text-xs">
                          {safeNumber(token.current_price) > 0 ? `$${safeNumber(token.current_price) < 0.01 ? safeNumber(token.current_price).toExponential(2) : safeNumber(token.current_price).toFixed(4)}` : 'N/A'}
                        </div>
                        <div className="text-right text-gray-400 font-mono text-sm">
                          {safeNumber(token.transaction_count)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                No token activity data available for this contract
              </div>
            )}
          </>
        )}

        {activeTab === 'abi' && (
          <div className="space-y-4">
            {details.abi ? (
              <>
                {/* Functions */}
                {details.abi.functions && details.abi.functions.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-cyan-300 mb-3">Functions ({details.abi.functions.length})</h3>
                    <div className="space-y-3">
                      {details.abi.functions.map((func: any, index: number) => renderAbiFunction(func, index))}
                    </div>
                  </div>
                )}

                {/* Variables */}
                {details.abi.variables && details.abi.variables.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-cyan-300 mb-3">Variables ({details.abi.variables.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {details.abi.variables.map((variable: any, index: number) => (
                        <div key={index} className="border border-gray-700 rounded p-3 bg-gray-800/30">
                          <div className="flex items-center justify-between">
                            <span className="text-cyan-300 font-mono font-medium">{safeString(variable.name)}</span>
                            <span className={`px-2 py-1 rounded text-xs ${
                              safeString(variable.access) === 'constant' ? 'bg-purple-600/20 text-purple-300' :
                              'bg-gray-600/20 text-gray-300'
                            }`}>
                              {safeString(variable.access)}
                            </span>
                          </div>
                          <div className="text-sm font-mono text-purple-300 mt-1">{renderType(variable.type)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Maps */}
                {details.abi.maps && details.abi.maps.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-cyan-300 mb-3">Maps ({details.abi.maps.length})</h3>
                    <div className="space-y-3">
                      {details.abi.maps.map((map: any, index: number) => (
                        <div key={index} className="border border-gray-700 rounded p-3 bg-gray-800/30">
                          <span className="text-cyan-300 font-mono font-medium">{map.name}</span>
                          <div className="text-sm font-mono text-gray-300 mt-1">
                            Key: <span className="text-orange-300">{renderType(map.key)}</span> → Value: <span className="text-purple-300">{renderType(map.value)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fungible Tokens */}
                {details.abi.fungible_tokens && details.abi.fungible_tokens.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-cyan-300 mb-3">Fungible Tokens</h3>
                    <div className="space-y-3">
                      {details.abi.fungible_tokens.map((token: any, index: number) => (
                        <div key={index} className="border border-green-500/30 rounded p-3 bg-green-500/10">
                          <div className="flex items-center space-x-2">
                            <Database className="text-green-400" size={16} />
                            <span className="text-green-300 font-mono font-medium">{safeString(token.name)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Non-Fungible Tokens */}
                {details.abi.non_fungible_tokens && details.abi.non_fungible_tokens.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-cyan-300 mb-3">Non-Fungible Tokens</h3>
                    <div className="space-y-3">
                      {details.abi.non_fungible_tokens.map((token: any, index: number) => (
                        <div key={index} className="border border-orange-500/30 rounded p-3 bg-orange-500/10">
                          <div className="flex items-center space-x-2">
                            <FileText className="text-orange-400" size={16} />
                            <span className="text-orange-300 font-mono font-medium">{safeString(token.name)}</span>
                          </div>
                          <div className="text-sm font-mono text-gray-300 mt-1">Type: {renderType(token.type)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-400">
                No ABI data available for this contract
              </div>
            )}
          </div>
        )}

        {activeTab === 'source' && (
          <div>
            {details.source_code ? (
              <div className="border border-gray-700 rounded-lg overflow-hidden">
                <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-300">Source Code</span>
                  <button
                    onClick={() => copyToClipboard(details.source_code || '')}
                    className="text-gray-400 hover:text-cyan-300 transition-colors"
                    title="Copy source code"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <pre className="p-4 text-sm font-mono text-gray-300 whitespace-pre-wrap">
                    {details.source_code}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                No source code available for this contract
              </div>
            )}
          </div>
        )}

        {activeTab === 'interfaces' && (
          <div className="space-y-4">
            {details.interfaces && details.interfaces.length > 0 ? (
              <>
                <div className="text-sm text-gray-400 mb-4">
                  This contract implements {details.interfaces.length} interface{details.interfaces.length !== 1 ? 's' : ''}
                </div>
                {details.interfaces.map((iface, index) => (
                  <div key={index} className={`border rounded-lg p-4 ${getInterfaceColor(iface.interface)}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        {getInterfaceIcon(iface.interface)}
                        <span className="font-mono font-medium text-gray-200">{iface.interface}</span>
                        {iface.is_verified && (
                          <span className="px-2 py-1 bg-green-600/20 text-green-300 text-xs rounded">
                            Verified
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {iface.metadata && (
                      <div className="mt-3">
                        <div className="text-sm text-gray-400 mb-2">Interface Metadata:</div>
                        <pre className="text-xs font-mono bg-gray-800/50 p-3 rounded border overflow-x-auto">
                          {JSON.stringify(iface.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <div className="text-center py-8 text-gray-400">
                No interfaces detected for this contract
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};