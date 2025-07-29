import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { WalletDetailsView } from './WalletDetailsView';
import { ContractDetailsView } from './ContractDetailsView';

interface NodeDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string;
}

// Import the specific types from the detail views
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
  token_activity: any[];
  top_counterparties: any[];
}

interface ContractDetails {
  type: 'contract';
  address: string;
  contract_address: string;
  contract_name: string;
  abi: any;
  source_code?: string;
  created_at?: string;
  interfaces: any[];
  recent_interactions: number;
  avg_usd_per_interaction: number;
  avg_interactions_per_day: number;
  earliest_transaction?: string | { value: string };
  latest_transaction?: string | { value: string };
  recent_users: number;
  active_tokens: number;
  token_activity: any[];
}

type NodeDetails = WalletDetails | ContractDetails;

export const NodeDetailsModal: React.FC<NodeDetailsModalProps> = ({
  isOpen,
  onClose,
  address
}) => {
  const [details, setDetails] = useState<NodeDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && address) {
      fetchNodeDetails();
    }
  }, [isOpen, address]);

  const fetchNodeDetails = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/node-details/${encodeURIComponent(address)}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch details: ${response.statusText}`);
      }
      
      const data = await response.json();
      setDetails(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch node details');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" 
         style={{ backdropFilter: 'blur(4px)' }}>
      <div className="bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88]/30 rounded-none max-w-5xl max-h-[90vh] w-full mx-4 overflow-hidden flex flex-col font-mono"
           style={{ boxShadow: '0 0 30px rgba(0,255,136,0.2), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-2 border-[#00ff88]/30 bg-black/50">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-[#00ff88] rounded-full animate-pulse" 
                 style={{ boxShadow: '0 0 10px #00ff88' }} />
            <h2 className="text-[#00ff88] font-mono font-bold text-sm uppercase tracking-wider">
              ◦ {details?.type === 'contract' ? 'CONTRACT DETAILS' : 'WALLET DETAILS'} ◦
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-[#00ff88] transition-colors p-2 hover:bg-[#00ff88]/10 rounded-none"
            style={{ filter: 'drop-shadow(0 0 4px rgba(0,255,136,0.3))' }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-themed">
          {loading && (
            <div className="flex items-center justify-center p-12 bg-black">
              <div className="relative">
                <div className="w-12 h-12 border-4 border-[#00ff88]/20 border-t-[#00ff88] rounded-full animate-spin"
                     style={{ filter: 'drop-shadow(0 0 8px rgba(0,255,136,0.5))' }}></div>
                <div className="absolute inset-0 w-12 h-12 border-2 border-[#00ff88]/40 rounded-full animate-pulse"></div>
              </div>
              <div className="ml-6">
                <div className="text-[#00ff88] font-mono font-bold text-sm uppercase tracking-wider mb-1">
                  ◦ LOADING DETAILS ◦
                </div>
                <div className="text-gray-400 font-mono text-xs">
                  Analyzing blockchain data...
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-8 text-center bg-black">
              <div className="bg-gradient-to-b from-red-900/20 to-black border-2 border-red-500/50 rounded-none p-6"
                   style={{ boxShadow: '0 0 20px rgba(255,68,68,0.3)' }}>
                <div className="text-red-400 font-mono font-bold text-sm uppercase tracking-wider mb-3">
                  ◦ ERROR LOADING DETAILS ◦
                </div>
                <div className="text-gray-400 font-mono text-sm mb-6">
                  {typeof error === 'string' ? error : 'An error occurred while loading details'}
                </div>
                <button
                  onClick={fetchNodeDetails}
                  className="bg-gradient-to-b from-[#00ff88] to-[#00cc66] text-black font-mono font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-none hover:from-[#00cc66] hover:to-[#00aa44] transition-all transform hover:scale-105"
                  style={{ 
                    boxShadow: '0 0 15px rgba(0,255,136,0.5)',
                    filter: 'drop-shadow(0 0 4px rgba(0,255,136,0.3))'
                  }}
                >
                  ◦ RETRY ANALYSIS ◦
                </button>
              </div>
            </div>
          )}

          {details && !loading && !error && (
            <>
              {details.type === 'wallet' ? (
                <WalletDetailsView details={details as any} />
              ) : (
                <ContractDetailsView details={details as any} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};