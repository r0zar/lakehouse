'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal, sankeyLeft } from 'd3-sankey';

interface SankeyNode {
  name: string;
  category: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

interface SankeyChartProps {
  width?: number;
  height?: number;
  nodeAlign?: string;
  linkColor?: string;
  limit?: number;
  asset?: string;
  minValue?: number;
}

const SankeyChart: React.FC<SankeyChartProps> = ({
  width = 928,
  height = 600,
  nodeAlign = 'sankeyLeft',
  linkColor = 'source',
  limit = 1000,
  asset,
  minValue = 0
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<SankeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data from BigQuery
  useEffect(() => {
    const fetchSankeyData = async () => {
      try {
        setLoading(true);
        
        // Build query parameters
        const params = new URLSearchParams();
        if (limit !== 1000) params.append('limit', limit.toString());
        if (asset) params.append('asset', asset);
        if (minValue !== 0) params.append('minValue', minValue.toString());
        
        // Fetch complete Sankey data from single endpoint
        const url = `/api/sankey${params.toString() ? `?${params.toString()}` : ''}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error('Failed to fetch Sankey data');
        }

        const sankeyData = await response.json();
        console.log('Raw API response:', sankeyData);
        
        // Validate the response structure
        if (!sankeyData || typeof sankeyData !== 'object') {
          throw new Error('Invalid response format');
        }
        
        if (!Array.isArray(sankeyData.nodes)) {
          throw new Error('Invalid nodes data - expected array');
        }
        
        if (!Array.isArray(sankeyData.links)) {
          throw new Error('Invalid links data - expected array');
        }
        
        setData(sankeyData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchSankeyData();
  }, [limit, asset, minValue]);

  // Create the Sankey chart
  useEffect(() => {
    if (!data || !svgRef.current) return;
    
    // Defensive checks
    if (!data.nodes || !Array.isArray(data.nodes)) {
      console.error('Invalid nodes data:', data.nodes);
      return;
    }
    if (!data.links || !Array.isArray(data.links)) {
      console.error('Invalid links data:', data.links);
      return;
    }
    
    console.log('Sankey data:', { 
      nodeCount: data.nodes.length, 
      linkCount: data.links.length 
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous chart

    const format = d3.format(",.0f");

    // Constructs and configures a Sankey generator
    const sankeyGenerator = sankey()
      .nodeId((d: any) => d.name)
      .nodeAlign(sankeyLeft)
      .nodeWidth(15)
      .nodePadding(10)
      .extent([[1, 5], [width - 1, height - 5]]);

    // Get all unique node names referenced in links
    const allLinkedNodeNames = new Set([
      ...data.links.flatMap(l => [l.source, l.target])
    ]);
    
    // Filter nodes to only those that are actually used in links
    const usedNodes = data.nodes.filter(node => allLinkedNodeNames.has(node.name));
    
    // Add any missing nodes referenced in links but not in nodes list
    const existingNodeNames = new Set(usedNodes.map(n => n.name));
    const missingNodes = Array.from(allLinkedNodeNames)
      .filter(name => !existingNodeNames.has(name))
      .map(name => ({ name, category: 'System' }));
    
    const completeNodes = [...usedNodes, ...missingNodes];

    console.log('Complete nodes structure:', completeNodes.slice(0, 3));
    console.log('Links structure:', data.links.slice(0, 3));
    
    // Validate that nodes have required properties
    const validNodes = completeNodes.filter(node => node.name && typeof node.name === 'string');
    const validLinks = data.links.filter(link => 
      link.source && link.target && typeof link.value === 'number' && link.value > 0
    );
    
    console.log(`Filtered to ${validNodes.length} valid nodes and ${validLinks.length} valid links`);
    
    if (validNodes.length === 0 || validLinks.length === 0) {
      console.error('No valid nodes or links found');
      return;
    }

    // Use real data but filter to top flows for performance
    const topLinks = validLinks.slice(0, 50); // Top 50 highest value links
    const linkedNodeNames = new Set([
      ...topLinks.flatMap(l => [l.source, l.target])
    ]);
    
    const linkedNodes = validNodes.filter(node => linkedNodeNames.has(node.name));

    console.log(`Using ${linkedNodes.length} real nodes and ${topLinks.length} real links`);

    // Apply it to the data - make copies to avoid mutating original
    const { nodes, links } = sankeyGenerator({
      nodes: linkedNodes.map(d => Object.assign({}, d)),
      links: topLinks.map(d => Object.assign({}, d))
    } as any);

    // Define better color scale
    const categoryColors = {
      'Wallet': '#3B82F6',    // Blue
      'Contract': '#EF4444',  // Red  
      'System': '#10B981',    // Green
      'DeFi': '#8B5CF6',      // Purple
      'Stacking': '#F59E0B'   // Amber
    };
    const color = (category: string) => categoryColors[category as keyof typeof categoryColors] || '#6B7280';

    // Create the rects that represent the nodes
    const rect = svg.append("g")
        .attr("stroke", "#fff")
        .attr("stroke-width", 2)
      .selectAll("rect")
      .data(nodes)
      .join("rect")
        .attr("x", (d: any) => d.x0)
        .attr("y", (d: any) => d.y0)
        .attr("height", (d: any) => d.y1 - d.y0)
        .attr("width", (d: any) => d.x1 - d.x0)
        .attr("fill", (d: any) => color(d.category))
        .attr("rx", 3)
        .attr("ry", 3);

    // Add titles on the nodes
    rect.append("title")
        .text((d: any) => `${d.name}\n${format(d.value)} units`);

    // Create the paths that represent the links
    const link = svg.append("g")
        .attr("fill", "none")
        .attr("stroke-opacity", 0.6)
      .selectAll("g")
      .data(links)
      .join("g")
        .style("mix-blend-mode", "multiply");

    // Create gradients for all links
    const gradient = link.append("linearGradient")
        .attr("id", (d: any) => (d.uid = `link-${Math.random()}`))
        .attr("gradientUnits", "userSpaceOnUse")
        .attr("x1", (d: any) => d.source.x1)
        .attr("x2", (d: any) => d.target.x0);
    
    gradient.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", (d: any) => color(d.source.category))
        .attr("stop-opacity", 0.8);
    
    gradient.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", (d: any) => color(d.target.category))
        .attr("stop-opacity", 0.8);

    // Add the link paths
    link.append("path")
        .attr("d", sankeyLinkHorizontal())
        .attr("stroke", (d: any) => `url(#${d.uid})`)
        .attr("stroke-width", (d: any) => Math.max(2, d.width));

    // Add titles on the links
    link.append("title")
        .text((d: any) => `${d.source.name} → ${d.target.name}\n${format(d.value)} units`);

    // Add labels on the nodes
    svg.append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
        .attr("x", (d: any) => d.x0 < width / 2 ? d.x1 + 8 : d.x0 - 8)
        .attr("y", (d: any) => (d.y1 + d.y0) / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", (d: any) => d.x0 < width / 2 ? "start" : "end")
        .text((d: any) => d.name.length > 25 ? d.name.substring(0, 25) + '...' : d.name)
        .style("font", "12px sans-serif")
        .style("font-weight", "500")
        .style("fill", "#ffffff")
        .style("text-shadow", "0 1px 2px rgba(0,0,0,0.8)");

  }, [data, width, height, nodeAlign, linkColor]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">Loading Sankey chart...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: '100%', height: 'auto', font: '10px sans-serif' }}
      />
    </div>
  );
};

export default SankeyChart;