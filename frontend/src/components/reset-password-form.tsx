// src/components/reset-password-form.tsx
"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
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

export function ResetPasswordForm({ className, siteKey, ...props }: Props) {
  const { t } = useTranslation('auth');
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const captchaRef = React.useRef<HTMLDivElement | null>(null);
  const widgetIdRef = React.useRef<string | null>(null);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = React.useState<string>("");

  // Render Turnstile after mount like in login
  React.useEffect(() => {
    let cancelled = false;

    function ensureRender() {
      if (cancelled) return;
      if (!captchaRef.current) return;
      if (widgetIdRef.current) return;
      if (!window.turnstile) {
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
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
      }
    };
  }, [siteKey]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (!captchaToken) {
        setLoading(false);
        return setError(t('login.captchaRequired'));
      }

      const formData = new FormData(formRef.current!);
      formData.append("captchaToken", captchaToken);

      const result = await actions.resetPassword(formData);

      if (!result?.data?.success) {
        if (result?.data?.message?.includes("captcha protection")) {
          setError(t('errors.invalidCredentials'));
          window.turnstile?.reset?.(widgetIdRef.current || undefined);
          setCaptchaToken("");
        } else {
          setError(t('errors.invalidCredentials'));
        }
        setLoading(false);
        return;
      }

      setSuccess(t('resetPassword.checkEmail'));
      setLoading(false);
    } catch {
      setError(t('errors.invalidCredentials'));
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
        <h1 className="text-2xl font-bold">{t('resetPassword.title')}</h1>
        <p className="text-balance text-sm text-muted-foreground">
          {t('resetPassword.subtitle')}
        </p>
      </div>

      <div className="grid gap-6">
  


        <div className="grid gap-2">
          <div className="flex items-center">
            <Label htmlFor="email">{t('resetPassword.emailLabel')}</Label>
            <a href="/" className="ml-auto text-sm underline-offset-4 hover:underline">
              {t('resetPassword.backToLogin')}
            </a>
          </div>
          <Input id="email" name="email" type="email" placeholder={t('resetPassword.emailPlaceholder')} required />
        </div>

        {/* Captcha-Container */}
        <div ref={captchaRef} />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-green-600">{success}</p> : null}

        <Button type="submit" className="w-full cursor-pointer" disabled={loading}>
          {loading ? t('resetPassword.submitting') : t('resetPassword.submitButton')}
        </Button>
      </div>
    </form>
  );
}
