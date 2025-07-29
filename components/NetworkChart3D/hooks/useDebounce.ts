import { useCallback, useRef } from 'react';

/**
 * Custom hook for debouncing function calls
 * Useful for high-frequency events like mouse hover
 */
export function useDebounce<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  ) as T;
  
  // Cleanup timeout on unmount
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);
  
  // Expose cleanup method
  (debouncedCallback as any).cleanup = cleanup;
  
  return debouncedCallback;
}

/**
 * Custom hook for throttling function calls
 * Ensures function is called at most once per time period
 */
export function useThrottle<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const lastCallRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  const throttledCallback = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallRef.current;
      
      if (timeSinceLastCall >= delay) {
        // Execute immediately if enough time has passed
        lastCallRef.current = now;
        callback(...args);
      } else {
        // Schedule execution for the remaining time
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = setTimeout(() => {
          lastCallRef.current = Date.now();
          callback(...args);
        }, delay - timeSinceLastCall);
      }
    },
    [callback, delay]
  ) as T;
  
  // Cleanup timeout on unmount
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);
  
  // Expose cleanup method
  (throttledCallback as any).cleanup = cleanup;
  
  return throttledCallback;
}

/**
 * Hook specifically for hover interactions with immediate unhover
 * Debounces hover events but allows immediate unhover for responsiveness
 */
export function useHoverDebounce<T extends (...args: any[]) => void>(
  onHover: T,
  delay: number = 50
): {
  debouncedHover: T;
  immediateUnhover: () => void;
} {
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastNodeRef = useRef<any>(null);
  
  const debouncedHover = useCallback(
    (node: any, ...otherArgs: any[]) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // If node is null (unhover), execute immediately
      if (!node) {
        lastNodeRef.current = null;
        onHover(node, ...otherArgs);
        return;
      }
      
      // If same node, don't debounce
      if (node === lastNodeRef.current) {
        return;
      }
      
      // Debounce new node hover
      timeoutRef.current = setTimeout(() => {
        lastNodeRef.current = node;
        onHover(node, ...otherArgs);
      }, delay);
    },
    [onHover, delay]
  ) as T;
  
  const immediateUnhover = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    lastNodeRef.current = null;
    (onHover as any)(null);
  }, [onHover]);
  
  return {
    debouncedHover,
    immediateUnhover
  };
}