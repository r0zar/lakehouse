import { useState, useCallback, useEffect } from 'react';
import { NetworkNode } from '../components/NodeContextMenu';

export interface ContextMenuState {
  node: NetworkNode | null;
  position: { x: number; y: number };
  isVisible: boolean;
}

export interface UseContextMenuReturn {
  contextMenu: ContextMenuState;
  showContextMenu: (node: NetworkNode, position: { x: number; y: number }) => void;
  hideContextMenu: () => void;
  pinnedTooltips: NetworkNode[];
  addPinnedTooltip: (node: NetworkNode) => void;
  removePinnedTooltip: (nodeId: string) => void;
  clearAllPinnedTooltips: () => void;
  handleNodeAction: (action: string, node: NetworkNode) => void;
}

export interface UseContextMenuOptions {
  onNetworkFilter?: (nodeAddress: string) => void;
  onViewDetails?: (nodeAddress: string) => void;
}

export const useContextMenu = (options: UseContextMenuOptions = {}): UseContextMenuReturn => {
  const { onNetworkFilter, onViewDetails } = options;
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    node: null,
    position: { x: 0, y: 0 },
    isVisible: false
  });

  const [pinnedTooltips, setPinnedTooltips] = useState<NetworkNode[]>([]);

  const showContextMenu = useCallback((node: NetworkNode, position: { x: number; y: number }) => {
    setContextMenu({
      node,
      position,
      isVisible: true
    });
  }, []);

  const hideContextMenu = useCallback(() => {
    setContextMenu(prev => ({
      ...prev,
      isVisible: false
    }));
  }, []);

  const addPinnedTooltip = useCallback((node: NetworkNode) => {
    setPinnedTooltips(prev => {
      // Check if node is already pinned
      if (prev.some(tooltip => tooltip.name === node.name)) {
        return prev; // Don't add duplicates
      }
      
      // If we have 3 tooltips, show alert and don't add
      if (prev.length >= 3) {
        // Trigger alert notification using the existing hotkey feedback system
        const alertEvent = new CustomEvent('hotkeyFeedback', {
          detail: { action: 'pin-limit-reached' }
        });
        document.dispatchEvent(alertEvent);
        return prev; // Don't add new tooltip
      }
      
      // Otherwise just add the new one
      return [...prev, node];
    });
  }, []);

  const removePinnedTooltip = useCallback((nodeId: string) => {
    setPinnedTooltips(prev => prev.filter(tooltip => tooltip.name !== nodeId));
  }, []);

  const clearAllPinnedTooltips = useCallback(() => {
    setPinnedTooltips([]);
  }, []);

  // Close context menu on outside click or escape
  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu.isVisible) {
        hideContextMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        hideContextMenu();
        // Also close all pinned tooltips on escape
        if (pinnedTooltips.length > 0) {
          clearAllPinnedTooltips();
        }
      }
    };

    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu.isVisible, pinnedTooltips.length, hideContextMenu, clearAllPinnedTooltips]);

  const handleNodeAction = useCallback((action: string, node: NetworkNode) => {
    switch (action) {
      case 'pin-tooltip':
        addPinnedTooltip(node);
        break;
        
      case 'focus-camera':
        // This will be handled by the parent component
        // Trigger custom event or callback
        const event = new CustomEvent('nodeAction', {
          detail: { action, node }
        });
        document.dispatchEvent(event);
        break;
        
      case 'copy-address':
        if (navigator.clipboard) {
          navigator.clipboard.writeText(node.name).then(() => {
            // Could show a toast notification here
            console.log('Address copied to clipboard:', node.name);
          }).catch(err => {
            console.error('Failed to copy address:', err);
            // Fallback to older method
            const textArea = document.createElement('textarea');
            textArea.value = node.name;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
          });
        }
        break;
        
      case 'export-data':
        exportNodeData(node);
        break;
        
      case 'filter-network':
        // Trigger backend filtering via callback
        if (onNetworkFilter) {
          onNetworkFilter(node.name);
        }
        break;
        
      case 'view-details':
        // Trigger details modal via callback if available
        if (onViewDetails) {
          onViewDetails(node.name);
        }
        break;
        
      default:
        console.log('Unknown action:', action);
    }
  }, []);

  return {
    contextMenu,
    showContextMenu,
    hideContextMenu,
    pinnedTooltips,
    addPinnedTooltip,
    removePinnedTooltip,
    clearAllPinnedTooltips,
    handleNodeAction
  };
};

// Helper function to export node data
const exportNodeData = (node: NetworkNode) => {
  const data = {
    node: {
      id: node.id,
      name: node.name,
      category: node.category,
      value: node.value,
      dominantToken: node.dominantToken,
      earliestTransaction: node.earliestTransaction,
      latestTransaction: node.latestTransaction
    },
    tokenFlows: node.tokenFlows || {},
    connections: {
      neighbors: node.neighbors?.length || 0,
      links: node.links?.length || 0
    },
    exportedAt: new Date().toISOString(),
    exportType: 'node-analysis'
  };

  // Create and download JSON file
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `node-${node.name.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.json`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
  
  console.log('Node data exported:', node.name);
};