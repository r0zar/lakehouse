'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { formatTokenAmount } from '@/lib/tokenFormatter';

// Dynamically import ForceGraph3D with SSR disabled
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="text-white text-lg">Loading 3D Network...</div>
    </div>
  )
});


interface NetworkNode {
  id: string;
  name: string;
  category: string;
  value: number;
  val?: number;
  dominantToken?: string;
  tokenFlows?: Record<string, any>;
  latestTransaction?: string | null;
  earliestTransaction?: string | null;
}

interface NetworkLink {
  source: string;
  target: string;
  value: number;
  raw_value?: number;
  asset?: string;
  currency_symbol?: string;
  decimals?: number;
  token_symbol?: string;
  original_token_symbol?: string;
  asset_class_identifier?: string;
  token_image?: string;
  received_at?: string;
}

export interface NetworkData {
  nodes: NetworkNode[];
  links: NetworkLink[];
  dateRange?: {
    oldest: string;
    newest: string;
    count: number;
  } | null;
}

interface NetworkChart3DProps {
  data: NetworkData;
  hideIsolatedNodes?: boolean;
  showParticles?: boolean;
  onVisualizationReady?: () => void;
}

const NetworkChart3D: React.FC<NetworkChart3DProps> = ({ data, hideIsolatedNodes = true, showParticles = false, onVisualizationReady }) => {
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });
  const [isClient, setIsClient] = useState(false);
  
  // Cache THREE.js objects to avoid recreation on every render
  const geometryCache = useRef<Map<string, any>>(new Map());
  const materialCache = useRef<Map<string, any>>(new Map());
  
  // Cache tooltip HTML strings to avoid expensive string operations on every hover
  const tooltipCache = useRef<Map<string, string>>(new Map());

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

  // Process data for 3D visualization - now much simpler since SQL does the heavy lifting
  const processedData = React.useMemo(() => {
    console.log('Processing data - Raw input:', { nodeCount: data.nodes.length, linkCount: data.links.length });
    // Filter nodes based on hideIsolatedNodes setting
    let nodes = data.nodes;
    
    if (hideIsolatedNodes) {
      // Create a set of node IDs that have links
      const connectedNodeIds = new Set<string>();
      data.links.forEach(link => {
        connectedNodeIds.add(link.source);
        connectedNodeIds.add(link.target);
      });
      
      // Debug: Check for nodes with flows but no links
      let nodesWithFlowsButNoLinks = 0;
      let totalNodesWithFlows = 0;
      
      data.nodes.forEach(node => {
        const tokenFlows = Object.entries(node.tokenFlows || {});
        if (tokenFlows.length > 0) {
          totalNodesWithFlows++;
          if (!connectedNodeIds.has(node.name)) {
            nodesWithFlowsButNoLinks++;
            console.log(`Node ${node.name} has ${tokenFlows.length} token flows but no links:`, tokenFlows);
          }
        }
      });
      
      console.log(`Debug: ${nodesWithFlowsButNoLinks}/${totalNodesWithFlows} nodes have flows but no links`);
      console.log(`Links data:`, data.links.length, 'total links');
      
      // Filter to only include nodes that have connections
      nodes = nodes.filter(node => connectedNodeIds.has(node.name));
    }

    // Validate that all links reference existing nodes
    const nodeIds = new Set(nodes.map(node => node.name));
    const validLinks = data.links.filter(link => {
      const sourceExists = nodeIds.has(link.source);
      const targetExists = nodeIds.has(link.target);
      if (!sourceExists || !targetExists) {
        console.warn(`Filtered out link due to missing nodes - Source: ${link.source} (${sourceExists}), Target: ${link.target} (${targetExists})`);
      }
      return sourceExists && targetExists;
    });

    console.log(`Link validation: ${data.links.length} original -> ${validLinks.length} valid links`);

    // Process links with curvature and particles - controlled by showParticles prop
    const links = validLinks.map((link, index) => ({
      ...link,
      curvature: 0.05 + (Math.random() * 0.1), // Even gentler curvature for better performance
      rotation: (index * 0.2) % (Math.PI * 2), // Reduced rotation spread
      particles: showParticles ? (link.value > 1e15 ? 2 : 1) : 0, // Show particles based on toggle and value
    }));

    console.log('Final processed data:', { nodeCount: nodes.length, linkCount: links.length });
    return { nodes, links };
  }, [data, hideIsolatedNodes, showParticles]);

  // Pre-warm WebGL context and create common objects
  useEffect(() => {
    if (isClient && typeof window !== 'undefined') {
      // Pre-create some common mesh objects to warm up the GPU
      const categories = ['Wallet', 'Contract', 'System'];
      categories.forEach(category => {
        getCachedNodeObject(category, 4); // Pre-cache common node types
      });
    }
  }, [isClient]);

  // Signal when visualization is ready (after data processing and a short delay for rendering)
  useEffect(() => {
    if (processedData.nodes.length > 0 && onVisualizationReady) {
      // Add a small delay to ensure the 3D graph has had time to initialize
      const timer = setTimeout(() => {
        onVisualizationReady();
      }, 800); // Increased to 800ms to account for GPU warmup
      
      return () => clearTimeout(timer);
    }
  }, [processedData, onVisualizationReady]);

  // Color mapping for categories
  const getCategoryColor = (category: string) => {
    const colors = {
      'Wallet': '#3B82F6',    // Blue
      'Contract': '#EF4444',  // Red  
      'System': '#10B981',    // Green (legacy name for multisig wallets)
      'Multisig': '#10B981',  // Green (proper name for multisig wallets)
      'DeFi': '#8B5CF6',      // Purple
      'Stacking': '#F59E0B'   // Amber
    };
    return colors[category as keyof typeof colors] || '#6B7280';
  };

  // Cached THREE.js object creation with full mesh caching
  const getCachedNodeObject = (category: string, size: number = 4) => {
    if (typeof window === 'undefined') return null;
    
    const THREE = require('three');
    const cacheKey = `${category}_${size}`;
    
    // Cache the complete mesh, not just geometry/material
    if (!geometryCache.current.has(cacheKey)) {
      const geometry = new THREE.SphereGeometry(size * 0.5, 12, 8); // Reduced segments for better performance
      const material = new THREE.MeshLambertMaterial({
        color: getCategoryColor(category)
      });
      const mesh = new THREE.Mesh(geometry, material);
      geometryCache.current.set(cacheKey, mesh);
    }
    
    // Clone the cached mesh instead of creating new one
    const cachedMesh = geometryCache.current.get(cacheKey);
    return cachedMesh.clone();
  };

  // Generate and cache tooltip HTML
  const getCachedTooltipHTML = (node: any) => {
    // tokenFlows is now always a plain object (not Map) for JSON serialization
    const tokenFlowsArray = Object.entries(node.tokenFlows || {});
    
    
    const cacheKey = `${node.name}_${node.earliestTransaction || 'no-earliest'}_${node.latestTransaction || 'no-latest'}_${tokenFlowsArray.map((entry: any) => `${entry[0]}:${entry[1].inbound}:${entry[1].outbound}`).join('|')}`;
    
    if (tooltipCache.current.has(cacheKey)) {
      return tooltipCache.current.get(cacheKey)!;
    }

    // Create aligned grid for token flows - sort by total activity
    const sortedTokens = tokenFlowsArray
      .sort((a: any, b: any) => b[1].total - a[1].total)
      .filter(([_, flow]: any) => flow.inbound > 0 || flow.outbound > 0);

    let tokenFlowsGrid = '';
    if (sortedTokens.length > 0) {
      // Create two-column grid with headers
      tokenFlowsGrid = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 6px;">
          <!-- Credits Column -->
          <div>
            <div style="color: #00ff88; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; text-align: center; border-bottom: 1px solid rgba(0,255,136,0.3); padding-bottom: 2px;">
              ◦ CREDITS ◦
            </div>
            ${sortedTokens.map(([token, flow]: any) => {
              if (flow.inbound > 0) {
                return `<div style="color: #00ff88; font-family: 'Courier New', monospace; font-size: 10px; margin-bottom: 3px; text-align: right; padding-right: 4px;">+ ${formatTokenAmount(flow.inbound, token)}</div>`;
              } else {
                return `<div style="height: 16px;"></div>`; // Spacer for alignment
              }
            }).join('')}
          </div>
          
          <!-- Debits Column -->
          <div>
            <div style="color: #ff4444; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; text-align: center; border-bottom: 1px solid rgba(255,68,68,0.3); padding-bottom: 2px;">
              ◦ DEBITS ◦
            </div>
            ${sortedTokens.map(([token, flow]: any) => {
              if (flow.outbound > 0) {
                return `<div style="color: #ff4444; font-family: 'Courier New', monospace; font-size: 10px; margin-bottom: 3px; text-align: left; padding-left: 4px;">- ${formatTokenAmount(flow.outbound, token)}</div>`;
              } else {
                return `<div style="height: 16px;"></div>`; // Spacer for alignment
              }
            }).join('')}
          </div>
        </div>
      `;
    }

    const dateSection = (node.earliestTransaction && node.latestTransaction) ? (() => {
      const earliest = new Date(node.earliestTransaction);
      const latest = new Date(node.latestTransaction);
      
      // Format dates in local timezone with consistent options
      const dateOptions: Intl.DateTimeFormatOptions = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      };
      const timeOptions: Intl.DateTimeFormatOptions = { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
      };
      
      // If same day (in local timezone), show date range differently
      const sameDay = earliest.toDateString() === latest.toDateString();
      
      if (sameDay) {
        return `
          <div style="color: #8aa3b3; font-size: 10px; margin-bottom: 8px; font-family: 'Courier New', monospace; text-align: center;">
            ${earliest.toLocaleDateString(undefined, dateOptions)}<br>
            ${earliest.toLocaleTimeString(undefined, timeOptions)} → ${latest.toLocaleTimeString(undefined, timeOptions)}
          </div>
        `;
      } else {
        return `
          <div style="color: #8aa3b3; font-size: 10px; margin-bottom: 8px; font-family: 'Courier New', monospace; text-align: center;">
            ${earliest.toLocaleDateString(undefined, dateOptions)} → ${latest.toLocaleDateString(undefined, dateOptions)}<br>
            <span style="font-size: 9px; opacity: 0.8;">${earliest.toLocaleTimeString(undefined, timeOptions)} to ${latest.toLocaleTimeString(undefined, timeOptions)}</span>
          </div>
        `;
      }
    })() : '';

    const html = `
      <div style="
        background: linear-gradient(135deg, rgba(0,15,35,0.95) 0%, rgba(0,25,50,0.95) 100%);
        border: 2px solid #00ff88;
        border-radius: 0px;
        padding: 12px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        max-width: 700px;
        word-break: break-word;
        overflow-wrap: anywhere;
        box-shadow: 0 0 20px rgba(0,255,136,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
        position: relative;
      ">
        <div style="
          color: #00ff88; 
          font-weight: bold; 
          font-size: 9px; 
          text-transform: uppercase; 
          letter-spacing: 2px;
          margin-bottom: 8px;
          border-bottom: 1px solid rgba(0,255,136,0.3);
          padding-bottom: 4px;
        ">
          ${getCategoryDisplayName(node.category)} NODE
        </div>
        <div style="color: #ffffff; font-weight: bold; margin-bottom: 8px; font-size: 12px;">
          ${node.name}
        </div>
        ${dateSection}
        <div style="margin-top: 8px;">
          <div style="color: #00ff88; font-size: 9px; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 1px; text-align: center;">
            ◦ TRANSACTION FLOWS ◦
          </div>
          ${tokenFlowsGrid || `<div style="color: #00ff88; font-family: 'Courier New', monospace; text-align: center;">◦ ${formatTokenAmount(node.value, node.dominantToken)}</div>`}
        </div>
        <div style="
          position: absolute;
          top: 4px;
          right: 8px;
          width: 6px;
          height: 6px;
          background: #00ff88;
          border-radius: 50%;
          box-shadow: 0 0 8px #00ff88;
          animation: pulse 2s infinite;
        "></div>
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      </style>
    `;

    tooltipCache.current.set(cacheKey, html);
    return html;
  };

  // Display proper category names (convert legacy names to current ones)
  const getCategoryDisplayName = (category: string) => {
    const displayNames = {
      'System': 'Multisig',  // Convert legacy "System" to "Multisig"
      'Wallet': 'Wallet',
      'Contract': 'Contract',
      'Multisig': 'Multisig',
      'DeFi': 'DeFi',
      'Stacking': 'Stacking'
    };
    return displayNames[category as keyof typeof displayNames] || category;
  };

  // Link color based on value
  const getLinkColor = (link: any) => {
    const intensity = Math.min(link.value / 1e12, 1); // Normalize to 0-1
    return `rgba(100, 100, 100, ${0.3 + intensity * 0.7})`;
  };

  // Handle node click
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

      {/* Performance stats */}
      <div className="absolute top-4 right-4 z-10 bg-black bg-opacity-70 rounded-lg p-3">
        <div className="text-white text-xs">
          <div>FPS: <span id="fps-counter">--</span></div>
        </div>
      </div>

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
        nodeColor={(node: any) => getCategoryColor(node.category)}
        nodeVal={(node: any) => node.val}
        nodeLabel={(node: any) => getCachedTooltipHTML(node)}
        nodeThreeObject={(node: any) => getCachedNodeObject(node.category, node.val)}

        // Link appearance with curves and particles
        linkColor={getLinkColor}
        linkWidth={1}
        linkCurvature="curvature"
        linkCurveRotation="rotation"
        linkDirectionalArrowLength={0}
        linkDirectionalParticles="particles"
        linkDirectionalParticleSpeed={0.008} // Slightly slower for less GPU work
        linkDirectionalParticleWidth={1.2} // Smaller particles
        linkDirectionalParticleColor="#00ff88"
        linkDirectionalParticleResolution={3} // Reduced resolution for better performance

        // Interactions
        onNodeClick={handleNodeClick}
        onNodeHover={(node: any) => {
          document.body.style.cursor = node ? 'pointer' : 'default';
        }}

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
    </div>
  );
};

export default NetworkChart3D;