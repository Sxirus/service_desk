/**
 * Avatar Manager Utility
 * 
 * Handles avatar images for users including:
 * - Signed URL generation for viewing avatars (private bucket)
 * - URL caching to minimize API calls
 * - Helper functions for avatar display
 */

import { apiClient } from './api';

// Cache for signed URLs to avoid repeated API calls
// Key: avatar path, Value: { url: string, expiry: number }
const avatarUrlCache = new Map<string, { url: string; expiry: number }>();

// Cache duration: 50 minutes (signed URLs expire after 60 minutes)
const CACHE_DURATION_MS = 50 * 60 * 1000;

/**
 * Checks if a value looks like a storage path (not a URL)
 * Avatar paths are stored as: {client_id}/{employee_id}/avatar.webp
 * 
 * @param value - The value to check
 * @returns true if it's a storage path, false if it's a URL or empty
 */
export function isAvatarPath(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  
  // If it starts with http:// or https://, it's a URL (legacy public URL)
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return false;
  }
  
  // Check if it matches the expected path pattern: {client_id}/{employee_id}/avatar.webp
  const pathPattern = /^\d+\/\d+\/avatar\.webp$/;
  return pathPattern.test(value);
}

/**
 * Generates a signed URL for viewing an avatar
 * Uses caching to minimize API calls
 * 
 * @param path - Storage path of the avatar (e.g., "1/5/avatar.webp")
 * @returns Signed URL string or null if path is invalid
 */
export async function getAvatarSignedUrl(path: string): Promise<string | null> {
  if (!path || !isAvatarPath(path)) {
    // If it's already a URL, return it as-is (legacy support)
    if (path && (path.startsWith('http://') || path.startsWith('https://'))) {
      return path;
    }
    return null;
  }

  // Check cache first
  const cached = avatarUrlCache.get(path);
  if (cached && cached.expiry > Date.now()) {
    return cached.url;
  }

  try {
    const response = await apiClient.post('/avatars/getSignedUrl', {
      path: path.trim()
    }) as { success?: boolean; signedUrl?: string };

    if (!response || !response.signedUrl) {
      console.error('[AvatarManager] Invalid URL returned from server');
      return null;
    }

    // Cache the URL
    avatarUrlCache.set(path, {
      url: response.signedUrl,
      expiry: Date.now() + CACHE_DURATION_MS
    });

    return response.signedUrl;
  } catch (error) {
    console.error('[AvatarManager] Failed to get signed URL:', error);
    return null;
  }
}

/**
 * Generates signed URLs for multiple avatars (batch)
 * Uses caching to minimize API calls
 * 
 * @param paths - Array of storage paths
 * @returns Map of path to signed URL
 */
export async function getAvatarSignedUrls(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const pathsToFetch: string[] = [];

  // Check cache first
  for (const path of paths) {
    if (!path || !isAvatarPath(path)) {
      // If it's already a URL, include it directly
      if (path && (path.startsWith('http://') || path.startsWith('https://'))) {
        result.set(path, path);
      }
      continue;
    }

    const cached = avatarUrlCache.get(path);
    if (cached && cached.expiry > Date.now()) {
      result.set(path, cached.url);
    } else {
      pathsToFetch.push(path);
    }
  }

  // Fetch remaining URLs from server
  if (pathsToFetch.length > 0) {
    try {
      const response = await apiClient.post('/avatars/getSignedUrls', {
        paths: pathsToFetch
      }) as { urls?: Record<string, string> };

      if (response && response.urls) {
        for (const [path, url] of Object.entries(response.urls)) {
          result.set(path, url);
          
          // Cache the URL
          avatarUrlCache.set(path, {
            url,
            expiry: Date.now() + CACHE_DURATION_MS
          });
        }
      }
    } catch (error) {
      console.error('[AvatarManager] Failed to get batch signed URLs:', error);
    }
  }

  return result;
}

/**
 * Clears the avatar URL cache
 * Useful when a user updates their avatar
 */
export function clearAvatarCache(): void {
  avatarUrlCache.clear();
}

/**
 * Clears a specific avatar from cache
 * 
 * @param path - Storage path of the avatar to clear
 */
export function clearAvatarFromCache(path: string): void {
  avatarUrlCache.delete(path);
}

/**
 * Gets an avatar URL, handling both legacy public URLs and new private paths
 * This is a convenience function that handles the common case
 * 
 * @param avatarValue - Either a storage path or a URL
 * @returns The URL to use for the avatar, or null
 */
export async function resolveAvatarUrl(avatarValue: string | null | undefined): Promise<string | null> {
  if (!avatarValue) {
    return null;
  }

  // If it's already a URL, return it as-is
  if (avatarValue.startsWith('http://') || avatarValue.startsWith('https://')) {
    return avatarValue;
  }

  // Otherwise, get a signed URL
  return getAvatarSignedUrl(avatarValue);
}
