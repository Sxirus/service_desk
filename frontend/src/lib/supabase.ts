// src/lib/supabase.ts
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";

/**
 * Creates a Supabase client configured for server-side rendering (SSR)
 * Handles cookie-based session management for authentication
 * 
 * @param request - The incoming HTTP request object
 * @param cookies - Astro's cookie management interface
 * @returns Configured Supabase client instance
 */
export function createClient({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  // Extract cookie header from the request, default to empty string if not present
  const cookieHeader = request.headers.get("cookie") ?? "";

  return createServerClient(
    import.meta.env.SUPABASE_URL!,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        /**
         * Retrieves all cookies from the request header
         * Parses the cookie header string into individual cookie objects
         * @returns Array of cookie objects with name and value
         */
        getAll() {
          const parsed = parseCookieHeader(cookieHeader);
          return parsed.map(({ name, value }) => ({ name, value: value ?? "" }));
        },
        
        /**
         * Sets multiple cookies in the response
         * Configures cookie options for security and functionality
         * @param setCookies - Array of cookies to set with their options
         */
        setAll(setCookies) {
          for (const { name, value, options } of setCookies) {
            cookies.set(name, value, {
              ...options,                      // Spread existing options
              path: "/",                       // Make cookie available site-wide
              sameSite: "lax",                 // CSRF protection while allowing some cross-site usage
              secure: import.meta.env.PROD,    // true in production (HTTPS), false in development (HTTP)
            });
          }
        },
      },
      auth: {
        flowType: "pkce",                      // Use PKCE (Proof Key for Code Exchange) for enhanced security
        detectSessionInUrl: false,             // Disable automatic URL session detection to avoid conflicts
      },
    }
  );
}
