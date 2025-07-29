/**
 * LRU (Least Recently Used) Cache implementation with automatic THREE.js object disposal
 * Prevents unbounded memory growth and handles WebGL resource cleanup
 */

export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  
  /**
   * Get item from cache, marking it as recently used
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  /**
   * Set item in cache, automatically evicting LRU items when at capacity
   */
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        const firstValue = this.cache.get(firstKey);
        
        // Dispose THREE.js objects if they exist
        this.disposeThreeJSObject(firstValue);
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }
  
  /**
   * Clear all items from cache with proper disposal
   */
  clear(): void {
    // Dispose all THREE.js objects before clearing
    this.cache.forEach((value) => {
      this.disposeThreeJSObject(value);
    });
    this.cache.clear();
  }
  
  /**
   * Get current cache size
   */
  size(): number {
    return this.cache.size;
  }
  
  /**
   * Check if cache has key
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }
  
  /**
   * Delete item from cache with disposal
   */
  delete(key: K): boolean {
    const value = this.cache.get(key);
    if (value) {
      this.disposeThreeJSObject(value);
    }
    return this.cache.delete(key);
  }
  
  /**
   * Get all keys (useful for debugging)
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }
  
  /**
   * Helper method to properly dispose THREE.js objects
   */
  private disposeThreeJSObject(value: any): void {
    if (value && typeof value === 'object') {
      // Handle THREE.js Mesh objects
      if (value.geometry && value.geometry.dispose) {
        value.geometry.dispose();
      }
      
      // Handle materials (can be single material or array)
      if (value.material) {
        if (Array.isArray(value.material)) {
          value.material.forEach((mat: any) => {
            if (mat.dispose) mat.dispose();
          });
        } else if (value.material.dispose) {
          value.material.dispose();
        }
      }
      
      // Handle textures
      if (value.texture && value.texture.dispose) {
        value.texture.dispose();
      }
    }
  }
}

/**
 * Specialized cache for THREE.js mesh objects
 */
export class MeshLRUCache extends LRUCache<string, any> {
  constructor(maxSize: number = 50) {
    super(maxSize);
  }
}

/**
 * Specialized cache for HTML tooltip strings
 */
export class TooltipLRUCache extends LRUCache<string, string> {
  constructor(maxSize: number = 200) {
    super(maxSize);
  }
}

/**
 * Utility functions for THREE.js resource management
 */
export class ThreeJSResourceManager {
  /**
   * Dispose of a single THREE.js material and its textures
   */
  static disposeMaterial(material: any): void {
    if (!material) return;
    
    // Dispose textures
    const textureProps = ['map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap', 'envMap', 'alphaMap', 'aoMap', 'displacementMap', 'emissiveMap', 'metalnessMap', 'roughnessMap'];
    textureProps.forEach(prop => {
      if (material[prop] && material[prop].dispose) {
        material[prop].dispose();
      }
    });
    
    // Dispose material
    if (material.dispose) {
      material.dispose();
    }
  }
  
  /**
   * Dispose of a THREE.js object and all its resources
   */
  static disposeObject(object: any): void {
    if (!object) return;
    
    // Dispose geometry
    if (object.geometry && object.geometry.dispose) {
      object.geometry.dispose();
    }
    
    // Dispose materials
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach((material: any) => {
          this.disposeMaterial(material);
        });
      } else {
        this.disposeMaterial(object.material);
      }
    }
    
    // Remove from parent
    if (object.parent) {
      object.parent.remove(object);
    }
  }
  
  /**
   * Recursively dispose of a THREE.js scene and all its children
   */
  static disposeScene(scene: any): void {
    if (!scene) return;
    
    // Traverse scene and dispose of all objects
    scene.traverse((object: any) => {
      this.disposeObject(object);
    });
    
    // Clear scene children
    while (scene.children.length > 0) {
      scene.remove(scene.children[0]);
    }
  }
  
  /**
   * Trigger garbage collection if available (development mode)
   */
  static triggerGC(): void {
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc();
    }
  }
}