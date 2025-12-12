// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { createClient } from "./lib/supabase";
import { createPageLogger, perf } from "./utils/logger.ts";

const log = createPageLogger('middleware');

/**
 * Protected routes that require authentication
 * Routes are checked using startsWith for nested paths
 */
const PROTECTED_ROUTES = ["/dashboard", "/tickets", "/manage", "/api"];

/**
 * Authentication middleware
 * Verifies user authentication for protected routes using Supabase
 * Only trusts verified user data from the Supabase API (not session cookies alone)
 */
export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  
  // Track overall middleware performance
  const middlewareTimer = perf.start('middleware', 'total-processing');
  
  // Log all requests for debugging purposes
  log.info('Processing request: ', pathname);

  // Check if the current route requires authentication
  const isProtected = PROTECTED_ROUTES.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isProtected) {
    log.info("Protected route detected, verifying authentication");

    // Create Supabase client with request context
    const clientTimer = perf.start('middleware', 'create-supabase-client');
    const supabase = createClient({ request: ctx.request, cookies: ctx.cookies });
    perf.end(clientTimer);

    // SECURITY: Only trust verified user data from the Supabase API
    // We do NOT fallback to session data to prevent stale/invalid session exploitation
    const authTimer = perf.start('middleware', 'get-user');
    const { data: { user }, error } = await supabase.auth.getUser();
    perf.end(authTimer, { authenticated: !!user });

    if (error) {
      log.error("Authentication error:", { path: pathname, message: error.message, code: error.status });
      perf.end(middlewareTimer, { result: 'auth-error' });
      
      // Print performance report if tracking is enabled
      perf.printReport('middleware');
      perf.clear(); // Clear for next request
      
      return ctx.redirect("/");
    }

    if (!user) {
      log.warn("Unauthorized access attempt:", {
        path: pathname,
        timestamp: new Date().toISOString()
      });
      perf.end(middlewareTimer, { result: 'unauthorized' });
      
      // Print performance report if tracking is enabled
      perf.printReport('middleware');
      perf.clear(); // Clear for next request
      
      return ctx.redirect("/");
    }

    ctx.locals.user = user;
    ctx.locals.supabase = supabase;

    // Authentication successful
    log.info("Authentication successful", { userId: user.id, email: user.email, path: pathname });
    perf.end(middlewareTimer, { result: 'success', userId: user.id });
  } else {
    log.info("Public route, skipping authentication");
    perf.end(middlewareTimer, { result: 'public-route' });
  }

  // Print performance report if tracking is enabled
  perf.printReport('middleware');
  perf.clear(); // Clear for next request

  // Continue to the requested route
  return next();
});