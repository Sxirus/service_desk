// src/components/login-form.tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actions } from "astro:actions";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: any) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

type Props = React.ComponentPropsWithoutRef<"form"> & { siteKey: string };

export function LoginForm({ className, siteKey, ...props }: Props) {
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const captchaRef = React.useRef<HTMLDivElement | null>(null);
  const widgetIdRef = React.useRef<string | null>(null);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = React.useState<string>("");

  // Turnstile Widget erst nach Mount rendern
  React.useEffect(() => {
    let cancelled = false;

    function ensureRender() {
      if (cancelled) return;
      if (!captchaRef.current) return;
      if (widgetIdRef.current) return; // schon gerendert
      if (!window.turnstile) {
        // Script noch nicht da, später nochmal probieren
        setTimeout(ensureRender, 100);
        return;
        }
      widgetIdRef.current = window.turnstile.render(captchaRef.current, {
        sitekey: siteKey,
        theme: "auto",
        callback: (token: string) => setCaptchaToken(token),
        "error-callback": () => setCaptchaToken(""),
        "expired-callback": () => setCaptchaToken(""),
      });
    }

    ensureRender();
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile?.remove) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
    };
  }, [siteKey]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!captchaToken) {
        setLoading(false);
        return setError("Bitte das CAPTCHA ausfüllen.");
      }

      const formData = new FormData(formRef.current!);
      formData.append("captchaToken", captchaToken);

      const result = await actions.signIn(formData);
      if (!result?.data?.success) {
        if (result?.data?.message?.includes("captcha protection")) {
          setError("Verifizierung fehlgeschlagen. Bitte erneut versuchen.");
          window.turnstile?.reset?.(widgetIdRef.current || undefined);
          setCaptchaToken("");
        } else {
          setError("Login fehlgeschlagen. Bitte E-Mail und Passwort prüfen.");
          window.turnstile?.reset?.(widgetIdRef.current || undefined);
          setCaptchaToken("");
        }
        setLoading(false);
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Etwas ist schief gelaufen. Bitte später erneut versuchen.");
      window.turnstile?.reset?.(widgetIdRef.current || undefined);
      setCaptchaToken("");
      setLoading(false);
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Login to your account</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Enter your email below to login to your account
        </p>
      </div>

      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="youremail@example.com" required />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center">
            <Label htmlFor="password">Password</Label>
            <a href="/reset-password" className="ml-auto text-sm underline-offset-4 hover:underline">
              Forgot your password?
            </a>
          </div>
          <Input id="password" name="password" type="password" required />
        </div>

        {/* Captcha-Container. Server rendert nur leeres DIV, Turnstile füllt es nach Mount. */}
        <div ref={captchaRef} />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Button type="submit" className="w-full cursor-pointer" disabled={loading}>
          {loading ? "Einloggen..." : "Login"}
        </Button>
      </div>
    </form>
  );
}
