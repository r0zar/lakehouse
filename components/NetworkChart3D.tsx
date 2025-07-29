'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { formatTokenAmount } from '@/lib/tokenFormatter';
import { ThreeJSResourceManager } from './NetworkChart3D/utils/LRUCache';
import { meshFactory } from './NetworkChart3D/utils/MeshFactory';
import { useHoverDebounce } from './NetworkChart3D/hooks/useDebounce';
import { useTooltipGenerator } from './NetworkChart3D/hooks/useTooltipGenerator';
import { processNetworkData } from './NetworkChart3D/utils/DataProcessing';
import type { NetworkNode, NetworkLink, NetworkData } from './NetworkChart3D/types';
import { NodeContextMenu } from './NetworkChart3D/components/NodeContextMenu';
import { PinnedTooltip } from './NetworkChart3D/components/PinnedTooltip';
import { HoverTooltip } from './NetworkChart3D/components/HoverTooltip';
import { HotkeyFeedback } from './NetworkChart3D/components/HotkeyFeedback';
import { NodeDetailsModal } from './NetworkChart3D/components/NodeDetailsModal';
import { useContextMenu } from './NetworkChart3D/hooks/useContextMenu';

// Dynamically import ForceGraph3D with SSR disabled
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="text-white text-lg">Loading 3D Network...</div>
    </div>
  )
});



interface NetworkChart3DProps {
  data: NetworkData;
  hideIsolatedNodes?: boolean;
  showParticles?: boolean;
  focusMode?: boolean;
  onVisualizationReady?: () => void;
  onNetworkFilter?: (nodeAddress: string) => void;
}

const NetworkChart3D: React.FC<NetworkChart3DProps> = ({ data, hideIsolatedNodes = true, showParticles = false, focusMode = false, onVisualizationReady, onNetworkFilter }) => {
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });
  const [isClient, setIsClient] = useState(false);
  
  // Focus mode state management
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [highlightedLinks, setHighlightedLinks] = useState<Set<any>>(new Set());
  
  // Context menu and pinned tooltip state
  const {
    contextMenu,
    showContextMenu,
    hideContextMenu,
    pinnedTooltips,
    addPinnedTooltip,
    removePinnedTooltip,
    clearAllPinnedTooltips,
    handleNodeAction
  } = useContextMenu({ 
    onNetworkFilter,
    onViewDetails: (address: string) => {
      setDetailsModal({ isOpen: true, address });
    }
  });
  
  // Hotkey feedback state
  const [hotkeyAction, setHotkeyAction] = useState<string | null>(null);
  
  // Modal state
  const [detailsModal, setDetailsModal] = useState<{ isOpen: boolean; address: string }>({
    isOpen: false,
    address: ''
  });
  
  
  // Tooltip generation with caching
  const { generateTooltipHTML, clearCache: clearTooltipCache } = useTooltipGenerator(200);

  // Ensure we're on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Update dimensions on window resize
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Process data for 3D visualization using utility functions
  const processedData = React.useMemo(() => {
    return processNetworkData(data, hideIsolatedNodes, showParticles);
  }, [data, hideIsolatedNodes, showParticles]);

  // Pre-warm WebGL context and create common objects
  useEffect(() => {
    if (isClient && typeof window !== 'undefined') {
      // Pre-create some common mesh objects to warm up the GPU
      meshFactory.preWarmCache(['Wallet', 'Contract', 'System'], 4);
    }
  }, [isClient]);

  // Signal when visualization is ready (after data processing and proper rendering)
  useEffect(() => {
    if (processedData.nodes.length > 0 && onVisualizationReady) {
      // Wait for multiple animation frames to ensure THREE.js has rendered
      const timer = setTimeout(() => {
        // Additional check to ensure ForceGraph3D is properly initialized
        if (fgRef.current && fgRef.current.scene) {
          // Wait for one more frame to ensure the scene is fully rendered with new data
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              onVisualizationReady();
            });
          });
        } else {
          // Retry if scene isn't ready yet
          setTimeout(() => {
            onVisualizationReady();
          }, 300);
        }
      }, 1200); // Longer delay for more reliable rendering, especially for filters
      
      return () => clearTimeout(timer);
    }
  }, [processedData, onVisualizationReady]);

  // Cleanup THREE.js resources on component unmount
  useEffect(() => {
    return () => {
      
      // Clear all caches with proper disposal
      meshFactory.dispose();
      clearTooltipCache();
      
      // Clean up ForceGraph3D scene and all its resources
      if (fgRef.current && fgRef.current.scene) {
        const scene = fgRef.current.scene();
        ThreeJSResourceManager.disposeScene(scene);
      }
      
      // Clean up renderer if accessible
      if (fgRef.current && fgRef.current.renderer) {
        const renderer = fgRef.current.renderer();
        if (renderer && renderer.dispose) {
          renderer.dispose();
        }
      }
      
      // Force garbage collection hint (development mode)
      ThreeJSResourceManager.triggerGC();
      
      console.log('NetworkChart3D: Cleaned up all THREE.js resources');
    };
  }, []);


  // Handle node actions from context menu
  React.useEffect(() => {
    const handleNodeActionEvent = (event: CustomEvent) => {
      const { action, node } = event.detail;
      
      switch (action) {
        case 'focus-camera':
          handleNodeClick(node);
          break;
        case 'view-details':
          // Could open a detailed modal
          console.log('View details for node:', node.name);
          break;
      }
    };
    
    document.addEventListener('nodeAction', handleNodeActionEvent as EventListener);
    
    return () => {
      document.removeEventListener('nodeAction', handleNodeActionEvent as EventListener);
    };
  }, []);
  
  // Global hotkeys when hovering over nodes
  React.useEffect(() => {
    const handleGlobalHotkeys = (event: KeyboardEvent) => {
      // Only trigger if we're hovering over a node and context menu is not open
      if (!hoveredNode || contextMenu.isVisible) return;
      
      // Prevent hotkeys when typing in inputs
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }
      
      const key = event.key.toLowerCase();
      
      const actions: Record<string, string> = {
        'q': 'pin-tooltip',
        'w': 'focus-camera',
        'c': 'copy-address',
        'e': 'export-data',
        'f': 'filter-network',
        'a': 'view-details'
      };
      
      const action = actions[key];
      if (action) {
        event.preventDefault();
        handleNodeAction(action, hoveredNode);
        setHotkeyAction(action); // Show feedback
      }
    };
    
    document.addEventListener('keydown', handleGlobalHotkeys);
    
    return () => {
      document.removeEventListener('keydown', handleGlobalHotkeys);
    };
  }, [hoveredNode, contextMenu.isVisible, handleNodeAction]);

  // Listen for pin limit alerts
  React.useEffect(() => {
    const handlePinLimitAlert = (event: CustomEvent) => {
      const { action } = event.detail;
      setHotkeyAction(action);
    };
    
    document.addEventListener('hotkeyFeedback', handlePinLimitAlert as EventListener);
    
    return () => {
      document.removeEventListener('hotkeyFeedback', handlePinLimitAlert as EventListener);
    };
  }, []);



  // Link color and visibility based on focus mode - memoized for performance
  const getLinkColor = React.useCallback((link: any) => {
    if (focusMode && !highlightedLinks.has(link)) {
      // In focus mode, hide non-highlighted links by making them transparent
      return 'rgba(100, 100, 100, 0)';
    }
    
    const intensity = Math.min(link.value / 1e12, 1); // Normalize to 0-1
    return `rgba(100, 100, 100, ${0.3 + intensity * 0.7})`;
  }, [focusMode, highlightedLinks]);

  // Link width based on focus mode - memoized for performance
  const getLinkWidth = React.useCallback((link: any) => {
    if (focusMode && !highlightedLinks.has(link)) {
      // In focus mode, hide non-highlighted links by setting width to 0
      return 0;
    }
    return 1;
  }, [focusMode, highlightedLinks]);

  // Link particles based on focus mode - memoized for performance
  const getLinkParticles = React.useCallback((link: any) => {
    if (focusMode && !highlightedLinks.has(link)) {
      // In focus mode, hide particles for non-highlighted links
      return 0;
    }
    return link.particles || 0;
  }, [focusMode, highlightedLinks]);

  // Handle node hover for focus mode and tooltip display - memoized for performance
  const handleNodeHoverInternal = React.useCallback((node: any) => {
    // Always update hovered node for tooltip display
    setHoveredNode(node);
    
    // Focus mode link highlighting
    if (focusMode) {
      const newHighlightedLinks = new Set();
      
      if (node && node.links) {
        // Add all links connected to the hovered node
        node.links.forEach((link: any) => {
          newHighlightedLinks.add(link);
        });
      }
      
      setHighlightedLinks(newHighlightedLinks);
    }
    
    // Update cursor style
    document.body.style.cursor = node ? 'pointer' : 'default';
  }, [focusMode]);
  
  // Debounced hover with immediate unhover for better responsiveness
  const { debouncedHover: handleNodeHover } = useHoverDebounce(
    handleNodeHoverInternal,
    30 // 30ms debounce - fast enough to feel instant, slow enough to reduce updates
  );

  // Handle node click (left-click for camera focus)
  const handleNodeClick = (node: any) => {
    if (fgRef.current) {
      // Focus camera on clicked node
      const distance = 40;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);

      if (fgRef.current.cameraPosition) {
        fgRef.current.cameraPosition(
          { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
          node,
          3000
        );
      }
    }
  };
  
  // Handle node right-click (context menu) - specifically blocks right-drag on nodes
  const handleNodeRightClick = (node: any, event: any) => {
    event.preventDefault(); // Prevent default browser context menu
    event.stopPropagation(); // Stop event from bubbling up
    
    // Block any potential drag behavior on this specific node
    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    // Temporarily block mouse move events to prevent drag
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Get mouse position from the event
    const rect = event.target?.getBoundingClientRect() || { left: 0, top: 0 };
    const position = {
      x: event.clientX || rect.left + 100,
      y: event.clientY || rect.top + 100
    };
    
    showContextMenu(node, position);
  };

  // Show loading until client-side hydration is complete
  if (!isClient) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-lg">Loading 3D Network...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">


      {/* 3D Force Graph */}
      <ForceGraph3D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#000000"
        graphData={processedData}

        // Optimized warmup - reduced for faster initial rendering
        warmupTicks={30}

        // Node appearance
        nodeColor={(node: any) => meshFactory.getCategoryColor(node.category)}
        nodeVal={(node: any) => node.val}
        nodeLabel={() => ''} // Disable default tooltips
        nodeThreeObject={(node: any) => meshFactory.createNodeMesh(node.category, node.val)}

        // Link appearance with curves and particles
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        linkCurvature="curvature"
        linkCurveRotation="rotation"
        linkDirectionalArrowLength={0}
        linkDirectionalParticles={getLinkParticles}
        linkDirectionalParticleSpeed={0.008} // Slightly slower for less GPU work
        linkDirectionalParticleWidth={1.2} // Smaller particles
        linkDirectionalParticleColor="#00ff88"
        linkDirectionalParticleResolution={3} // Reduced resolution for better performance

        // Interactions
        onNodeClick={handleNodeClick}
        onNodeRightClick={handleNodeRightClick}
        onNodeHover={handleNodeHover}

        // Physics - optimized for faster initial settling
        d3AlphaDecay={0.05} // Increased from 0.02 for faster simulation settling
        d3VelocityDecay={0.6} // Increased from 0.4 for faster dampening
        numDimensions={3}
        forceEngine="d3"
        cooldownTicks={50} // Reduced from 100
        cooldownTime={8000} // Reduced from 15000ms

        // Camera
        showNavInfo={false}
        controlType="orbit"
      />
      
      {/* Context Menu */}
      <NodeContextMenu
        node={contextMenu.node}
        position={contextMenu.position}
        isVisible={contextMenu.isVisible}
        onClose={hideContextMenu}
        onActionSelect={handleNodeAction}
      />
      
      {/* Pinned Tooltips Container */}
      {pinnedTooltips.length > 0 && (
        <div 
          className="fixed top-4 right-4 z-40 flex flex-col gap-4 max-h-[calc(100vh-2rem)] overflow-y-auto"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#00ff88 rgba(0, 0, 0, 0.3)'
          }}
        >
          <style jsx>{`
            div::-webkit-scrollbar {
              width: 8px;
            }
            
            div::-webkit-scrollbar-track {
              background: linear-gradient(180deg, rgba(0, 0, 0, 0.8) 0%, rgba(55, 65, 81, 0.3) 50%, rgba(0, 0, 0, 0.8) 100%);
              border-radius: 0px;
              border: 1px solid rgba(0, 255, 136, 0.2);
            }
            
            div::-webkit-scrollbar-thumb {
              background: linear-gradient(180deg, #00ff88 0%, rgba(0, 255, 136, 0.7) 50%, #00ff88 100%);
              border-radius: 0px;
              border: 1px solid rgba(0, 255, 136, 0.5);
              box-shadow: 
                0 0 8px rgba(0, 255, 136, 0.4),
                inset 0 1px 0 rgba(255, 255, 255, 0.2),
                inset 0 -1px 0 rgba(0, 0, 0, 0.5);
            }
            
            div::-webkit-scrollbar-thumb:hover {
              background: linear-gradient(180deg, #00ff88 0%, rgba(0, 255, 136, 0.9) 50%, #00ff88 100%);
              box-shadow: 
                0 0 12px rgba(0, 255, 136, 0.6),
                inset 0 1px 0 rgba(255, 255, 255, 0.3),
                inset 0 -1px 0 rgba(0, 0, 0, 0.6);
            }
          `}</style>
          {pinnedTooltips.map((node) => (
            <PinnedTooltip
              key={node.name}
              node={node}
              onClose={() => removePinnedTooltip(node.name)}
              useFlexbox={true}
            />
          ))}
        </div>
      )}
      
      {/* Hover Tooltip */}
      <HoverTooltip
        node={hoveredNode}
      />
      
      {/* Hotkey Feedback */}
      <HotkeyFeedback
        action={hotkeyAction}
        onComplete={() => setHotkeyAction(null)}
      />
      
      {/* Node Details Modal */}
      <NodeDetailsModal
        isOpen={detailsModal.isOpen}
        address={detailsModal.address}
        onClose={() => setDetailsModal({ isOpen: false, address: '' })}
      />
    </div>
  );
};

export default NetworkChart3D;