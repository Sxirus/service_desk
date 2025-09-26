// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { createClient } from "./lib/supabase";

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  console.log("Middleware executing for path:", pathname);

  if (pathname === "/dashboard" || pathname.startsWith("/tickets/") || pathname.startsWith("/manage/")) {
    console.log("Checking auth for protected route");

    const supabase = createClient({ request: ctx.request, cookies: ctx.cookies });

    // 1) Schnell: lokale Session aus Cookie (kein Netz)
    const [{ data: sessionData }, { data: userData, error: userErr }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);

    if (userErr) console.warn("[auth] getUser error:", userErr.message);
    const userId = userData?.user?.id ?? sessionData?.session?.user?.id;

    if (!userId) {
      // weder verifizierter User noch Session -> raus
      return ctx.redirect("/");
    }
  }

  return next();
});
