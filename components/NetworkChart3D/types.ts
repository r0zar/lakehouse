// Shared types for NetworkChart3D components

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
  links?: NetworkLink[];
}

export interface NetworkLink {
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
  // Visual properties added during processing
  curvature?: number;
  rotation?: number;
  particles?: number;
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