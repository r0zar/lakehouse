import React, { useEffect, useRef } from 'react';

export interface NetworkNode {
  id: string;
  name: string;
  category: string;
  value: number;
  val?: number;
  dominantToken?: string;
  tokenFlows?: Record<string, any>;
  latestTransaction?: string | null;
  earliestTransaction?: string | null;
  neighbors?: NetworkNode[];
  links?: any[];
}

export interface NodeContextMenuProps {
  node: NetworkNode | null;
  position: { x: number; y: number };
  isVisible: boolean;
  onClose: () => void;
  onActionSelect: (action: string, node: NetworkNode) => void;
}

export type ContextMenuAction = 
  | 'pin-tooltip'
  | 'focus-camera' 
  | 'copy-address'
  | 'export-data'
  | 'filter-network'
  | 'view-details';

interface MenuOption {
  id: ContextMenuAction;
  label: string;
  icon: string;
  description: string;
  shortcut?: string;
}

const menuOptions: MenuOption[] = [
  {
    id: 'pin-tooltip',
    label: 'Pin Info Panel',
    icon: '📌',
    description: 'Pin node information to corner',
    shortcut: 'Q'
  },
  {
    id: 'focus-camera',
    label: 'Focus Camera',
    icon: '🎯',
    description: 'Center camera on this node',
    shortcut: 'W'
  },
  {
    id: 'copy-address',
    label: 'Copy Address',
    icon: '📋',
    description: 'Copy node address to clipboard',
    shortcut: 'C'
  },
  {
    id: 'export-data',
    label: 'Export Data',
    icon: '📄',
    description: 'Download node transaction data',
    shortcut: 'E'
  },
  {
    id: 'filter-network',
    label: 'Filter Network',
    icon: '🔍',
    description: 'Deep search connected nodes',
    shortcut: 'F'
  },
  {
    id: 'view-details',
    label: 'View Details',
    icon: '📊',
    description: 'Open detailed analysis modal',
    shortcut: 'A'
  }
];

export const NodeContextMenu: React.FC<NodeContextMenuProps> = ({
  node,
  position,
  isVisible,
  onClose,
  onActionSelect
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isVisible, onClose]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isVisible || !node) return;

      const option = menuOptions.find(opt => 
        opt.shortcut && event.key.toLowerCase() === opt.shortcut.toLowerCase()
      );

      if (option) {
        event.preventDefault();
        onActionSelect(option.id, node);
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible, node, onActionSelect, onClose]);

  if (!isVisible || !node) {
    return null;
  }

  // Adjust position to prevent menu from going off-screen
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 400), // Account for maxWidth
    y: Math.min(position.y, window.innerHeight - 360) // Account for potentially taller menu
  };

  const getCategoryDisplayName = (category: string) => {
    const displayNames = {
      'System': 'Multisig',
      'Wallet': 'Wallet', 
      'Contract': 'Contract',
      'Multisig': 'Multisig',
      'DeFi': 'DeFi',
      'Stacking': 'Stacking'
    };
    return displayNames[category as keyof typeof displayNames] || category;
  };

  const handleOptionClick = (option: MenuOption) => {
    onActionSelect(option.id, node);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88] rounded-none font-mono"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        boxShadow: '0 0 20px rgba(0,255,136,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        width: 'fit-content',
        maxWidth: '400px',
        minWidth: '240px'
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#00ff88]/30">
        <div className="text-[#00ff88] text-xs uppercase tracking-wider font-bold mb-1">
          ◦ {getCategoryDisplayName(node.category)} NODE ◦
        </div>
        <div className="text-white text-sm font-medium break-all" title={node.name}>
          {node.name}
        </div>
        <div className="text-gray-400 text-xs mt-1">
          Right-click menu • ESC to close
        </div>
      </div>

      {/* Menu Options */}
      <div className="py-2">
        {menuOptions.map((option, index) => (
          <button
            key={option.id}
            onClick={() => handleOptionClick(option)}
            className="w-full px-4 py-3 text-left hover:bg-[#00ff88]/10 transition-all duration-150 border-none bg-transparent"
            style={{
              borderBottom: index < menuOptions.length - 1 ? '1px solid rgba(0,255,136,0.1)' : 'none'
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-lg">{option.icon}</span>
                <div>
                  <div className="text-white text-sm font-medium">
                    {option.label}
                  </div>
                  <div className="text-gray-400 text-xs">
                    {option.description}
                  </div>
                </div>
              </div>
              {option.shortcut && (
                <div className="text-[#00ff88] text-xs font-mono bg-black/50 px-2 py-1 rounded border border-[#00ff88]/30">
                  {option.shortcut}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#00ff88]/30 bg-black/30">
        <div className="text-gray-500 text-xs text-center">
          ◦ NODE INTERACTION SYSTEM ◦
        </div>
      </div>

      {/* Animated corner indicator */}
      <div 
        className="absolute top-2 right-2 w-2 h-2 bg-[#00ff88] rounded-full animate-pulse"
        style={{
          boxShadow: '0 0 8px #00ff88'
        }}
      />
    </div>
  );
};