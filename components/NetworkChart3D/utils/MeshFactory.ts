import { MeshLRUCache } from './LRUCache';

// Color mapping for different node categories
const getCategoryColor = (category: string): string => {
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

// THREE.js mesh factory with caching
export class MeshFactory {
  private geometryCache: MeshLRUCache;
  private materialCache: MeshLRUCache;

  constructor(geometryCacheSize = 50, materialCacheSize = 20) {
    this.geometryCache = new MeshLRUCache(geometryCacheSize);
    this.materialCache = new MeshLRUCache(materialCacheSize);
  }

  // Create or retrieve cached node mesh
  createNodeMesh(category: string, size: number = 4): any {
    if (typeof window === 'undefined') return null;
    
    const THREE = require('three');
    const cacheKey = `${category}_${size}`;
    
    // Check LRU cache first
    let cachedMesh = this.geometryCache.get(cacheKey);
    
    if (!cachedMesh) {
      const geometry = new THREE.SphereGeometry(size * 0.5, 12, 8); // Reduced segments for better performance
      const material = new THREE.MeshLambertMaterial({
        color: getCategoryColor(category)
      });
      const mesh = new THREE.Mesh(geometry, material);
      
      // Store in LRU cache
      this.geometryCache.set(cacheKey, mesh);
      cachedMesh = mesh;
    }
    
    // Clone the cached mesh instead of creating new one
    return cachedMesh.clone();
  }

  // Get category color (exposed for external use)
  getCategoryColor(category: string): string {
    return getCategoryColor(category);
  }

  // Pre-warm cache with common objects
  preWarmCache(categories: string[] = ['Wallet', 'Contract', 'System'], defaultSize: number = 4): void {
    if (typeof window === 'undefined') return;
    
    categories.forEach(category => {
      this.createNodeMesh(category, defaultSize);
    });
  }

  // Cleanup all cached meshes and their WebGL resources
  dispose(): void {
    console.log('MeshFactory: Starting cleanup of cached meshes...');
    
    // Clear caches (the LRUCache.clear() method handles disposal automatically)
    this.geometryCache.clear();
    this.materialCache.clear();
    
    console.log('MeshFactory: All meshes and materials disposed');
  }

  // Get cache statistics
  getCacheStats(): { geometryCache: number; materialCache: number } {
    return {
      geometryCache: this.geometryCache.size(),
      materialCache: this.materialCache.size()
    };
  }
}

// Export singleton instance for use across the application
export const meshFactory = new MeshFactory();