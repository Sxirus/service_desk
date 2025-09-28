// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { createClient } from "./lib/supabase";

// Define middleware to handle authentication for protected routes
export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  console.log("Middleware executing for path:", pathname);

  // Check if the current path requires authentication
  if (pathname === "/dashboard" || pathname.startsWith("/tickets/") || pathname.startsWith("/manage/")) {
    console.log("Checking auth for protected route");

    // Create Supabase client with request context
    const supabase = createClient({ request: ctx.request, cookies: ctx.cookies });

    // Parallel fetch: Get both session and user data simultaneously for better performance
    // 1) Fast: local session from cookie (no network request)
    // 2) Verified: user data from Supabase API (with network request)
    const [{ data: sessionData }, { data: userData, error: userErr }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);

    // Log any errors from user verification
    if (userErr) console.warn("[auth] getUser error:", userErr.message);
    
    // Get user ID from either verified user data or session data as fallback
    const userId = userData?.user?.id ?? sessionData?.session?.user?.id;

    // If no valid user ID found, redirect to login page
    if (!userId) {
      // Neither verified user nor session available -> redirect to login
      return ctx.redirect("/");
    }
  }

  // Continue to the requested route if not protected or authentication passed
  return next();
});
