import { NetworkNode, NetworkLink, NetworkData } from '../types';

/**
 * Utility functions for processing network data for visualization
 */

/**
 * Filter nodes to show only those with connections when isolation mode is enabled
 */
export const filterIsolatedNodes = (
  nodes: NetworkNode[], 
  links: NetworkLink[], 
  hideIsolated: boolean
): NetworkNode[] => {
  if (!hideIsolated) {
    return nodes;
  }
  
  // Create a set of node IDs that have links
  const connectedNodeIds = new Set<string>();
  links.forEach(link => {
    connectedNodeIds.add(link.source);
    connectedNodeIds.add(link.target);
  });
  
  // Debug: Check for nodes with flows but no links
  let nodesWithFlowsButNoLinks = 0;
  let totalNodesWithFlows = 0;
  
  nodes.forEach(node => {
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
  
  // Filter to only include nodes that have connections
  return nodes.filter(node => connectedNodeIds.has(node.name));
};

/**
 * Validate links to ensure they reference existing nodes and filter out invalid ones
 */
export const validateAndFilterLinks = (
  links: NetworkLink[], 
  nodes: NetworkNode[]
): NetworkLink[] => {
  const nodeIds = new Set(nodes.map(node => node.name));
  const validLinks = links.filter(link => {
    const sourceExists = nodeIds.has(link.source);
    const targetExists = nodeIds.has(link.target);
    if (!sourceExists || !targetExists) {
      console.warn(`Filtered out link due to missing nodes - Source: ${link.source} (${sourceExists}), Target: ${link.target} (${targetExists})`);
    }
    return sourceExists && targetExists;
  });

  console.log(`Link validation: ${links.length} original -> ${validLinks.length} valid links`);
  return validLinks;
};

/**
 * Add visual properties to links (curvature, rotation, particles)
 */
export const enhanceLinksWithVisualProperties = (
  links: NetworkLink[], 
  showParticles: boolean
): NetworkLink[] => {
  return links.map((link, index) => ({
    ...link,
    curvature: 0.05 + (Math.random() * 0.1), // Even gentler curvature for better performance
    rotation: (index * 0.2) % (Math.PI * 2), // Reduced rotation spread
    particles: showParticles ? (link.value > 1e15 ? 2 : 1) : 0, // Show particles based on toggle and value
  }));
};

/**
 * Create enhanced nodes with neighbor and link relationships for focus mode
 */
export const buildNodeRelationships = (
  nodes: NetworkNode[], 
  links: NetworkLink[]
): NetworkNode[] => {
  // Initialize nodes with empty relationships
  const enhancedNodes = nodes.map(node => ({
    ...node,
    neighbors: [],
    links: []
  }));

  // Create lookup map for enhanced nodes
  const nodeMap = new Map();
  enhancedNodes.forEach(node => {
    nodeMap.set(node.name, node);
  });

  // Build neighbor and link relationships
  links.forEach(link => {
    const sourceNode = nodeMap.get(link.source);
    const targetNode = nodeMap.get(link.target);
    
    if (sourceNode && targetNode) {
      // Add neighbors
      sourceNode.neighbors.push(targetNode);
      targetNode.neighbors.push(sourceNode);
      
      // Add links
      sourceNode.links.push(link);
      targetNode.links.push(link);
    }
  });

  console.log('Enhanced nodes created:', { nodeCount: enhancedNodes.length, linkCount: links.length });
  return enhancedNodes;
};

/**
 * Process raw network data through the complete transformation pipeline
 */
export const processNetworkData = (
  data: NetworkData,
  hideIsolatedNodes: boolean,
  showParticles: boolean
): { nodes: NetworkNode[]; links: NetworkLink[] } => {
  console.log('Processing network data - Raw input:', { 
    nodeCount: data.nodes.length, 
    linkCount: data.links.length 
  });

  // Step 1: Filter isolated nodes if requested
  const filteredNodes = filterIsolatedNodes(data.nodes, data.links, hideIsolatedNodes);

  // Step 2: Validate and filter links
  const validLinks = validateAndFilterLinks(data.links, filteredNodes);

  // Step 3: Add visual properties to links
  const enhancedLinks = enhanceLinksWithVisualProperties(validLinks, showParticles);

  // Step 4: Build node relationships
  const enhancedNodes = buildNodeRelationships(filteredNodes, enhancedLinks);

  console.log('Final processed data:', { 
    nodeCount: enhancedNodes.length, 
    linkCount: enhancedLinks.length 
  });

  return { nodes: enhancedNodes, links: enhancedLinks };
};

/**
 * Calculate basic network statistics
 */
export const calculateNetworkStats = (nodes: NetworkNode[], links: NetworkLink[]) => {
  const stats = {
    nodeCount: nodes.length,
    linkCount: links.length,
    averageConnections: links.length > 0 ? (links.length * 2) / nodes.length : 0,
    categories: {} as Record<string, number>,
    totalVolume: 0
  };

  // Count nodes by category
  nodes.forEach(node => {
    stats.categories[node.category] = (stats.categories[node.category] || 0) + 1;
  });

  // Calculate total volume
  stats.totalVolume = links.reduce((sum, link) => sum + (link.value || 0), 0);

  return stats;
};