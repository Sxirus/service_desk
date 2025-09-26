// src/lib/supabase.ts
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";

export function createClient({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  const cookieHeader = request.headers.get("cookie") ?? "";

  return createServerClient(
    import.meta.env.SUPABASE_URL!,
    import.meta.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const parsed = parseCookieHeader(cookieHeader);
          return parsed.map(({ name, value }) => ({ name, value: value ?? "" }));
        },
        setAll(setCookies) {
          for (const { name, value, options } of setCookies) {
            cookies.set(name, value, {
              ...options,
              path: "/",                       // <- wichtig
              sameSite: "lax",
              secure: false,    // dev=false
            });
          }
        },
      },
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
      },
    }
  );
}
