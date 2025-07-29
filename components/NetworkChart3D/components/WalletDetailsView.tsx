import { Copy, ExternalLink, TrendingUp, TrendingDown, Users, Coins, FileText, Shield } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { generateWalletAnalysis } from '@/lib/analysis-engine';
import { AnalysisSummary } from './AnalysisSummary';

interface EnrichedTokenActivity {
  contract_id: string;
  token_symbol: string;
  token_name?: string;
  display_symbol?: string;
  token_image?: string;
  decimals: number;
  transaction_count: number;
  inbound_tokens: number;
  outbound_tokens: number;
  inbound_usd: number;
  outbound_usd: number;
  avg_tokens_per_tx: number;
  avg_usd_per_tx: number;
  current_price: number;
}

interface RecentCounterparty {
  counterparty: string;
  transaction_count: number;
  total_usd_volume: number;
}

interface WalletDetails {
  type: 'wallet';
  address: string;
  recent_transactions: number;
  avg_usd_per_tx: number;
  avg_txs_per_day: number;
  earliest_transaction: string | { value: string };
  latest_transaction: string | { value: string };
  recent_counterparties: number;
  active_tokens: number;
  token_activity: EnrichedTokenActivity[];
  top_counterparties: RecentCounterparty[];
}

interface WalletDetailsViewProps {
  details: WalletDetails;
}

export const WalletDetailsView: React.FC<WalletDetailsViewProps> = ({ details }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'tokens' | 'counterparties'>('overview');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Safely extract values from BigQuery complex objects
  const safeValue = (value: any): any => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object' && 'value' in value) return value.value;
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

  const formatVolume = (volume: number | undefined | null) => {
    const vol = safeNumber(volume);
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(2)}K`;
    return vol.toFixed(2);
  };

  const formatAddress = (address: string) => {
    if (address.length <= 20) return address;
    return `${address.slice(0, 10)}...${address.slice(-6)}`;
  };

  return (
    <div className="flex flex-col h-full bg-black font-mono">
      {/* Tab Navigation */}
      <div className="flex border-b-2 border-[#00ff88]/30 bg-black/50">
        {[
          { id: 'overview', label: 'OVERVIEW', icon: <FileText size={16} /> },
          { id: 'tokens', label: 'TOKENS', icon: <Coins size={16} /> },
          { id: 'counterparties', label: 'COUNTERPARTIES', icon: <Users size={16} /> }
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
      <div className="flex-1 overflow-y-auto scrollbar-themed p-6 space-y-6">
        {activeTab === 'overview' && (
          <>
            {/* AI Analysis Summary */}
            <AnalysisSummary analysis={generateWalletAnalysis(details)} />

            {/* Address Section */}
      <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4" 
           style={{ boxShadow: '0 0 20px rgba(0,255,136,0.2), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[#00ff88] text-xs uppercase tracking-wider font-bold border-b border-[#00ff88]/30 pb-2">
            ◦ WALLET ADDRESS ◦
          </div>
          <button
            onClick={() => copyToClipboard(details.address)}
            className="text-gray-400 hover:text-[#00ff88] transition-colors p-2 hover:bg-[#00ff88]/10 rounded-none"
            title="Copy address"
          >
            <Copy size={16} />
          </button>
        </div>
        <div className="font-mono text-sm text-white break-all bg-black/50 p-3 border border-[#00ff88]/20">
          {details.address}
        </div>
      </div>

      {/* Overview Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4 hover:border-[#00ff88]/60 transition-all" 
             style={{ boxShadow: '0 0 15px rgba(0,255,136,0.2)' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-[#00ff88] font-mono">${safeNumber(details.avg_usd_per_tx).toFixed(2)}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wider">AVG USD / TX</div>
            </div>
            <div className="text-[#00ff88] opacity-70">
              <TrendingUp size={24} />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4 hover:border-[#00ff88]/60 transition-all" 
             style={{ boxShadow: '0 0 15px rgba(0,255,136,0.2)' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-[#00ff88] font-mono">{safeNumber(details.avg_txs_per_day).toFixed(1)}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wider">AVG TXS / DAY</div>
            </div>
            <div className="text-[#00ff88] opacity-70">
              <TrendingDown size={24} />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4 hover:border-[#00ff88]/60 transition-all" 
             style={{ boxShadow: '0 0 15px rgba(0,255,136,0.2)' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-[#00ff88] font-mono">{safeNumber(details.recent_counterparties).toLocaleString()}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wider">RECENT COUNTERPARTIES</div>
            </div>
            <div className="text-[#00ff88] opacity-70">
              <Users size={24} />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4 hover:border-[#00ff88]/60 transition-all" 
             style={{ boxShadow: '0 0 15px rgba(0,255,136,0.2)' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-[#00ff88] font-mono">{safeNumber(details.active_tokens)}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wider">ACTIVE TOKENS</div>
            </div>
            <div className="text-[#00ff88] opacity-70">
              <Coins size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      {details.earliest_transaction && details.latest_transaction && (
        <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4" 
             style={{ boxShadow: '0 0 20px rgba(0,255,136,0.2), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
          <div className="text-[#00ff88] text-xs uppercase tracking-wider font-bold border-b border-[#00ff88]/30 pb-2 mb-4">
            ◦ ACTIVITY TIMELINE ◦
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-black/50 border border-[#00ff88]/20 p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">FIRST TRANSACTION</div>
              <div className="text-[#00ff88] font-mono text-lg font-bold">
                {formatDistanceToNow(new Date(typeof details.earliest_transaction === 'object' ? details.earliest_transaction.value : details.earliest_transaction))} ago
              </div>
              <div className="text-xs text-gray-500 font-mono mt-1 opacity-80">
                {new Date(typeof details.earliest_transaction === 'object' ? details.earliest_transaction.value : details.earliest_transaction).toLocaleString()}
              </div>
            </div>
            <div className="bg-black/50 border border-[#00ff88]/20 p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">LATEST TRANSACTION</div>
              <div className="text-[#00ff88] font-mono text-lg font-bold">
                {formatDistanceToNow(new Date(typeof details.latest_transaction === 'object' ? details.latest_transaction.value : details.latest_transaction))} ago
              </div>
              <div className="text-xs text-gray-500 font-mono mt-1 opacity-80">
                {new Date(typeof details.latest_transaction === 'object' ? details.latest_transaction.value : details.latest_transaction).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
          </>
        )}

        {activeTab === 'tokens' && (
          <>
            {/* Enhanced Token Activity */}
      {details.token_activity && details.token_activity.length > 0 && (
        <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4" 
             style={{ boxShadow: '0 0 20px rgba(0,255,136,0.2), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
          <div className="text-[#00ff88] text-xs uppercase tracking-wider font-bold border-b border-[#00ff88]/30 pb-2 mb-4">
            ◦ TOKEN ACTIVITY (LAST {safeNumber(details.recent_transactions)} TXS) ◦
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
      )}
          </>
        )}

        {activeTab === 'counterparties' && (
          <>
            {/* Top Counterparties */}
      {details.top_counterparties && details.top_counterparties.length > 0 && (
        <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none p-4" 
             style={{ boxShadow: '0 0 20px rgba(0,255,136,0.2), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
          <div className="text-[#00ff88] text-xs uppercase tracking-wider font-bold border-b border-[#00ff88]/30 pb-2 mb-4">
            ◦ TOP COUNTERPARTIES ◦
          </div>
          <div className="space-y-3">
            {details.top_counterparties.map((counterparty, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-black/50 border border-[#00ff88]/20 hover:border-[#00ff88]/40 transition-all">
                <div className="flex items-center space-x-4">
                  <div className="w-8 h-8 bg-gradient-to-b from-[#00ff88] to-[#00cc66] rounded-none flex items-center justify-center text-black text-sm font-bold font-mono"
                       style={{ boxShadow: '0 0 10px rgba(0,255,136,0.5)' }}>
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-mono text-sm text-white break-all">
                      {counterparty.counterparty}
                    </div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">
                      {counterparty.transaction_count} TRANSACTIONS
                    </div>
                  </div>
                </div>
                <div className="text-right flex items-center space-x-3">
                  <div>
                    <div className="text-[#00ff88] font-mono font-bold">
                      ${formatVolume(safeNumber(counterparty.total_usd_volume))}
                    </div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider">VOLUME</div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(counterparty.counterparty)}
                    className="text-gray-400 hover:text-[#00ff88] transition-colors p-2 hover:bg-[#00ff88]/10 rounded-none"
                    title="Copy address"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
          </>
        )}
      </div>
    </div>
  );
};