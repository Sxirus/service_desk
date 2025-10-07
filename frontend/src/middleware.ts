// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { createClient } from "./lib/supabase";

/**
 * Protected routes that require authentication
 * Routes are checked using startsWith for nested paths
 */
const PROTECTED_ROUTES = ["/dashboard", "/tickets", "/manage"];

/**
 * Authentication middleware
 * Verifies user authentication for protected routes using Supabase
 * Only trusts verified user data from the Supabase API (not session cookies alone)
 */
export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  
  // Log all requests for debugging purposes
  console.log("[middleware] Processing request:", pathname);

  // Check if the current route requires authentication
  const isProtected = PROTECTED_ROUTES.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isProtected) {
    console.log("[middleware] Protected route detected, verifying authentication");

    // Create Supabase client with request context
    const supabase = createClient({ request: ctx.request, cookies: ctx.cookies });

    // SECURITY: Only trust verified user data from the Supabase API
    // We do NOT fallback to session data to prevent stale/invalid session exploitation
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      console.error("[middleware] Authentication error:", {
        path: pathname,
        error: error.message,
        code: error.status
      });
      return ctx.redirect("/");
    }

    if (!user) {
      console.warn("[middleware] Unauthorized access attempt:", {
        path: pathname,
        timestamp: new Date().toISOString()
      });
      return ctx.redirect("/");
    }

    // Authentication successful
    console.log("[middleware] Authentication successful:", {
      userId: user.id,
      email: user.email,
      path: pathname
    });
  } else {
    console.log("[middleware] Public route, skipping authentication");
  }

  // Continue to the requested route
  return next();
});