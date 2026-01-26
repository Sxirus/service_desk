/**
 * React hook for resolving avatar URLs from storage paths
 * 
 * Handles both legacy public URLs and new private storage paths.
 * Automatically fetches signed URLs when needed and caches them.
 */

import { useState, useEffect } from 'react';
import { resolveAvatarUrl, isAvatarPath, clearAvatarFromCache } from '@/utils/avatarManager';

/**
 * Hook to resolve a single avatar URL
 * 
 * @param avatarPathOrUrl - Either a storage path or a URL
 * @returns { url: string | null, isLoading: boolean }
 */
export function useAvatarUrl(avatarPathOrUrl: string | null | undefined): {
  url: string | null;
  isLoading: boolean;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Reset state when input changes
    setUrl(null);
    
    if (!avatarPathOrUrl) {
      setIsLoading(false);
      return;
    }

    // If it's already a URL, use it directly
    if (!isAvatarPath(avatarPathOrUrl)) {
      if (avatarPathOrUrl.startsWith('http://') || avatarPathOrUrl.startsWith('https://')) {
        setUrl(avatarPathOrUrl);
      }
      setIsLoading(false);
      return;
    }

    // Need to fetch a signed URL
    setIsLoading(true);
    
    let cancelled = false;
    
    resolveAvatarUrl(avatarPathOrUrl)
      .then((resolvedUrl) => {
        if (!cancelled) {
          setUrl(resolvedUrl);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error('[useAvatarUrl] Failed to resolve URL:', error);
        if (!cancelled) {
          setUrl(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [avatarPathOrUrl]);

  return { url, isLoading };
}

/**
 * Hook to resolve multiple avatar URLs (for lists)
 * 
 * @param items - Array of items with avatar paths
 * @param getPath - Function to extract the avatar path from each item
 * @returns Map of original path to resolved URL
 */
export function useAvatarUrls<T>(
  items: T[],
  getPath: (item: T) => string | null | undefined
): {
  urls: Map<string, string>;
  isLoading: boolean;
} {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const paths = items
      .map(getPath)
      .filter((p): p is string => !!p);

    if (paths.length === 0) {
      setUrls(new Map());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let cancelled = false;

    // Resolve all URLs in parallel
    Promise.all(
      paths.map(async (path) => {
        const resolved = await resolveAvatarUrl(path);
        return [path, resolved] as const;
      })
    )
      .then((results) => {
        if (!cancelled) {
          const newMap = new Map<string, string>();
          for (const [path, url] of results) {
            if (url) {
              newMap.set(path, url);
            }
          }
          setUrls(newMap);
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error('[useAvatarUrls] Failed to resolve URLs:', error);
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [items, getPath]);

  return { urls, isLoading };
}

/**
 * Utility function to force refresh an avatar URL
 * Useful after uploading a new avatar
 * 
 * @param avatarPath - The storage path of the avatar
 */
export function refreshAvatarUrl(avatarPath: string): void {
  clearAvatarFromCache(avatarPath);
}
