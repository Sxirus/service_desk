/**
 * API Client Utility
 * 
 * This utility provides authenticated API calls to your backend.
 * Use this ONLY in client-side scripts (inside <script> tags in .astro files)
 * or in React/Svelte components.
 * 
 * For server-side API calls in Astro (the --- section), use fetch with session.access_token directly.
 */

import { createBrowserClient } from '@supabase/ssr';

/**
 * Create a client-side Supabase client
 * This is for browser usage only (not server-side)
 */
const supabase = createBrowserClient(
  import.meta.env.PUBLIC_SUPABASE_URL!,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Get the current Supabase session
 * This is used to get the auth token for API requests
 */
async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * API Client for making authenticated requests to your backend
 */
export const apiClient = {
  baseURL: import.meta.env.PUBLIC_API_URL || 'http://localhost:3000/api',

  /**
   * Make an authenticated API request
   * @param endpoint - The API endpoint (e.g., '/emails/getMails')
   * @param options - Fetch options
   * @returns Response JSON
   */
  async request(endpoint: string, options: RequestInit = {}) {
    // Get current session for auth token
    const session = await getSession();
    
    if (!session) {
      throw new Error('Not authenticated - please log in');
    }

    // Build full URL
    const url = endpoint.startsWith('http') 
      ? endpoint 
      : `${this.baseURL}${endpoint}`;

    console.log(`[apiClient] ${options.method || 'GET'} ${url}`);

    // Make request with auth token
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        ...options.headers,
      },
    });

    // Handle non-OK responses
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (e) {
        // If error response isn't JSON, use default message
      }

      console.error(`[apiClient] Request failed:`, errorMessage);
      throw new Error(errorMessage);
    }

    // Return JSON response
    return response.json();
  },

  /**
   * GET request
   * @param endpoint - The API endpoint
   * @returns Response JSON
   */
  async get(endpoint: string) {
    return this.request(endpoint, { method: 'GET' });
  },

  /**
   * POST request
   * @param endpoint - The API endpoint
   * @param data - Request body data
   * @returns Response JSON
   */
  async post(endpoint: string, data?: any) {
    return this.request(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  /**
   * PUT request
   * @param endpoint - The API endpoint
   * @param data - Request body data
   * @returns Response JSON
   */
  async put(endpoint: string, data?: any) {
    return this.request(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  /**
   * DELETE request
   * @param endpoint - The API endpoint
   * @returns Response JSON
   */
  async delete(endpoint: string) {
    return this.request(endpoint, { method: 'DELETE' });
  },
};

/**
 * Helper for making server-side authenticated API calls
 * Use this in Astro's server-side code (the --- section)
 * 
 * @param endpoint - The API endpoint
 * @param accessToken - The session access token
 * @param options - Fetch options
 * @returns Response JSON
 */
export async function serverApiCall(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
) {
  const baseURL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000/api';
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `${baseURL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch (e) {
      // If error response isn't JSON, use default message
    }

    throw new Error(errorMessage);
  }

  return response.json();
}