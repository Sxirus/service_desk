"use client";

import React, { useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Mail,
  User as UserIcon,
  RefreshCw,
  Building2,
  MapPin,
  Globe,
  Landmark,
} from "lucide-react";

// shadcn/ui
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type UserLite = { id: string; email: string };
type Props = {
  initialStep?: number;
  regNonce: string;
  siteKey: string; // Cloudflare Turnstile Site Key
  currentUser: UserLite | null;
};

const TOTAL_STEPS = 6;

/* =========================
   STEP 1: Account schema
   ========================= */
const accountSchema = z.object({
  firstName: z.string().min(1, "Please enter your first name."),
  lastName: z.string().min(1, "Please enter your last name."),
  email: z.string().email("Please enter a valid work email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});
type AccountFormData = z.infer<typeof accountSchema>;

/* =========================
   STEP 2: Company schema
   ========================= */
const companySchema = z.object({
  name: z.string().min(2, "Please enter your company name."),
  address_street: z.string().min(2, "Please enter a street and number."),
  address_zip: z.string().min(2, "Please enter a ZIP / postal code."),
  address_city: z.string().min(2, "Please enter a city."),
  address_country: z.string().min(2, "Please enter a country."),
  website: z
    .string()
    .transform((v) => v.trim())
    .refine(
      (v) => v === "" || /^https?:\/\//i.test(v),
      "Website should start with http:// or https:// (or leave it empty)."
    )
    .optional()
    .nullable(),
  vat: z.string().optional().nullable(),
});
type CompanyFormData = z.infer<typeof companySchema>;

/* =========================
   Turnstile (compact)
   ========================= */
type TurnstileApi = {
  render: (el: HTMLElement, opts: any) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
  execute?: (id: string) => void;
};

async function ensureTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return;
  const ts = (window as any).turnstile as TurnstileApi | undefined;
  if (ts) return;

  const existing = document.querySelector<HTMLScriptElement>(
    'script[src*="challenges.cloudflare.com/turnstile"]'
  );
  if (existing) {
    if ((existing as any)._cfLoaded) return;
    await new Promise<void>((res) => {
      existing.addEventListener("load", () => res(), { once: true });
    });
    (existing as any)._cfLoaded = true;
    return;
  }

  await new Promise<void>((res) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    s.onload = () => res();
    document.head.appendChild(s);
  });
}

function TurnstileCompact({
  siteKey,
  cData,
  action = "register_create_account",
  onToken,
}: {
  siteKey: string;
  cData: string;
  action?: string;
  onToken: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  React.useEffect(() => {
    let disposed = false;
    (async () => {
      await ensureTurnstileScript();
      if (disposed) return;
      if (!containerRef.current) return;

      const ts = (window as any).turnstile as TurnstileApi | undefined;
      if (!ts) return;

      widgetIdRef.current = ts.render(containerRef.current, {
        sitekey: siteKey,
        size: "normal",
        action,
        cData,
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    })();

    return () => {
      disposed = true;
      const ts = (window as any).turnstile as TurnstileApi | undefined;
      if (widgetIdRef.current && ts) {
        try {
          ts.remove(widgetIdRef.current);
        } catch {}
      }
    };
  }, [siteKey, cData, action, onToken]);

  const handleReset = () => {
    const ts = (window as any).turnstile as TurnstileApi | undefined;
    if (widgetIdRef.current && ts) {
      try {
        ts.reset(widgetIdRef.current);
        onToken(null);
      } catch {}
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div ref={containerRef} />
      <Button type="button" variant="ghost" className="h-8 px-2" onClick={handleReset} title="Refresh captcha">
        <RefreshCw className="h-4 w-4" />
      </Button>
    </div>
  );
}

/* =========================
   Shared UI bits
   ========================= */
function StepDots({ step }: { step: number }) {
  const items = Array.from({ length: TOTAL_STEPS }).map((_, i) => i + 1);
  const pct = Math.max(0, Math.min(100, Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100)));
  return (
    <div className="space-y-3">
      <Progress value={pct} />
      <div className="flex items-center justify-center gap-2">
        {items.map((i) => (
          <div
            key={i}
            className={cn("h-2 w-2 rounded-full", i <= step ? "bg-primary" : "bg-muted")}
            aria-label={`Step ${i}`}
          />
        ))}
      </div>
    </div>
  );
}

function OneQuestionLayout({
  icon,
  title,
  description,
  children,
  onBack,
  onNextLabel = "Continue",
  showBack = true,
  nextDisabled,
  onSubmit,
  submitting,
  extraRight,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNextLabel?: string;
  showBack?: boolean;
  nextDisabled?: boolean;
  submitting?: boolean;
  onSubmit?: () => void;
  extraRight?: React.ReactNode; // e.g. Skip button
}) {
  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center space-y-2">
        <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          {icon}
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
        {description ? <CardDescription className="text-sm">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {children}
          <Separator />
          <div className="flex items-center justify-between gap-3">
            {showBack ? (
              <Button type="button" variant="outline" onClick={onBack}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              {extraRight}
              <Button type="button" onClick={onSubmit} disabled={!!nextDisabled || !!submitting}>
                {submitting ? (
                  <>
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-b-transparent" />
                    Working...
                  </>
                ) : (
                  <>
                    {onNextLabel}
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* =========================
   Component
   ========================= */
export default function RegisterWizard({ initialStep = 1, regNonce, siteKey, currentUser }: Props) {
  /* ---- Step control ---- */
  const [step, setStep] = useState<number>(initialStep);

  /* ---- Step 1 (Account) ---- */
  const [accountIdx, setAccountIdx] = useState<number>(0); // 0..3
  const [submittingAccount, setSubmittingAccount] = useState<boolean>(false);
  const [cfToken, setCfToken] = useState<string | null>(null);

  const accStorageKey = useMemo(() => `reg:${regNonce}:account`, [regNonce]);

  const accountForm = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: (() => {
      if (typeof window !== "undefined") {
        const raw = localStorage.getItem(accStorageKey);
        if (raw) {
          try {
            return JSON.parse(raw) as AccountFormData;
          } catch {}
        }
      }
      return {
        firstName: "",
        lastName: "",
        email: currentUser?.email ?? "",
        password: "",
      };
    })(),
    mode: "onBlur",
  });

  React.useEffect(() => {
    const sub = accountForm.watch((values) => {
      try {
        localStorage.setItem(accStorageKey, JSON.stringify(values));
      } catch {}
    });
    return () => sub.unsubscribe();
  }, [accountForm, accStorageKey]);

  const canBackMicroAccount = accountIdx > 0;

  const backAccount = () => {
    if (canBackMicroAccount) setAccountIdx((i) => i - 1);
  };

  const nextAccount = async () => {
    const fieldName = ["firstName", "lastName", "email", "password"][accountIdx] as keyof AccountFormData;
    const ok = await accountForm.trigger(fieldName);
    if (!ok) return;
    setAccountIdx((i) => Math.min(3, i + 1));
  };

  const doRegister = async () => {
    const okAll = await accountForm.trigger();
    if (!okAll) return;
    if (!cfToken) {
      alert("Please complete the captcha to continue.");
      return;
    }

    setSubmittingAccount(true);
    try {
      const { actions } = await import("astro:actions");
      const res = await actions.registerCreateAccount({
        reg_nonce: regNonce,
        first_name: accountForm.getValues("firstName"),
        last_name: accountForm.getValues("lastName"),
        email: accountForm.getValues("email"),
        password: accountForm.getValues("password"),
        captchaToken: cfToken,
      });

      if (!res?.data?.success) throw new Error(res?.data?.message || "Registration failed");
      try {
        localStorage.removeItem(accStorageKey);
      } catch {}
      setStep(2); // move to Company
    } catch (e: any) {
      alert(e?.message ?? "Unexpected error");
    } finally {
      setSubmittingAccount(false);
    }
  };

  /* ---- Step 2 (Company) ---- */
  const [companyIdx, setCompanyIdx] = useState<number>(0); // 0..6
  const [submittingCompany, setSubmittingCompany] = useState<boolean>(false);

  const compStorageKey = useMemo(() => `reg:${regNonce}:company`, [regNonce]);

  const companyForm = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: (() => {
      if (typeof window !== "undefined") {
        const raw = localStorage.getItem(compStorageKey);
        if (raw) {
          try {
            return JSON.parse(raw) as CompanyFormData;
          } catch {}
        }
      }
      return {
        name: "",
        address_street: "",
        address_zip: "",
        address_city: "",
        address_country: "",
        website: "",
        vat: "",
      };
    })(),
    mode: "onBlur",
  });

  React.useEffect(() => {
    const sub = companyForm.watch((values) => {
      try {
        localStorage.setItem(compStorageKey, JSON.stringify(values));
      } catch {}
    });
    return () => sub.unsubscribe();
  }, [companyForm, compStorageKey]);

  const canBackMicroCompany = companyIdx > 0;

  const backCompany = () => {
    if (canBackMicroCompany) setCompanyIdx((i) => i - 1);
    else setStep(1);
  };

  const nextCompany = async () => {
    const fields: (keyof CompanyFormData)[] = [
      "name",
      "address_street",
      "address_zip",
      "address_city",
      "address_country",
      "website",
      "vat",
    ];
    const fieldName = fields[companyIdx];
    // optional steps (website, vat) dürfen leer sein
    if (fieldName === "website" || fieldName === "vat") {
      // normalize website to https:// if user typed domain without scheme
      if (fieldName === "website") {
        const v = companyForm.getValues("website") ?? "";
        if (v && !/^https?:\/\//i.test(v)) {
          companyForm.setValue("website", `https://${v}`);
        }
      }
      setCompanyIdx((i) => Math.min(6, i + 1));
      return;
    }
    const ok = await companyForm.trigger(fieldName);
    if (!ok) return;
    setCompanyIdx((i) => Math.min(6, i + 1));
  };

  const skipCompanyOptional = () => {
    setCompanyIdx((i) => Math.min(6, i + 1));
  };

  const createCompany = async () => {
    // validate required fields
    const ok = await companyForm.trigger([
      "name",
      "address_street",
      "address_zip",
      "address_city",
      "address_country",
    ]);
    if (!ok) return;

    // normalize website again (safety)
    const web = companyForm.getValues("website") ?? "";
    if (web && !/^https?:\/\//i.test(web)) {
      companyForm.setValue("website", `https://${web}`);
    }

    setSubmittingCompany(true);
    try {
      const { actions } = await import("astro:actions");
      const res = await actions.registerCreateCompany({
        reg_nonce: regNonce,
        name: companyForm.getValues("name"),
        address_street: companyForm.getValues("address_street"),
        address_zip: companyForm.getValues("address_zip"),
        address_city: companyForm.getValues("address_city"),
        address_country: companyForm.getValues("address_country"),
        website: companyForm.getValues("website") || null,
        vat: companyForm.getValues("vat") || null,
      });

      if (!res?.data?.success) throw new Error(res?.data?.message || "Could not create company");
      try {
        localStorage.removeItem(compStorageKey);
      } catch {}
      setStep(3); // proceed to Support email step next (to be implemented)
    } catch (e: any) {
      alert(e?.message ?? "Unexpected error");
    } finally {
      setSubmittingCompany(false);
    }
  };

  /* =========================
     RENDER
     ========================= */
  return (
    <div className="w-full max-w-md">
      <div className="mb-4">
        <StepDots step={step} />
      </div>

      {/* ---------- STEP 1: ACCOUNT ---------- */}
      {step === 1 && (
        <>
          {accountIdx === 0 && (
            <OneQuestionLayout
              icon={<UserIcon className="h-5 w-5" />}
              title="What's your first name?"
              description="We will use it in your account profile."
              showBack={false}
              onSubmit={nextAccount}
            >
              <Form {...accountForm}>
                <FormField
                  control={accountForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input autoFocus placeholder="Jane" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </OneQuestionLayout>
          )}

          {accountIdx === 1 && (
            <OneQuestionLayout
              icon={<UserIcon className="h-5 w-5" />}
              title="And your last name?"
              description="This helps personalize your workspace."
              onBack={backAccount}
              onSubmit={nextAccount}
            >
              <Form {...accountForm}>
                <FormField
                  control={accountForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input autoFocus placeholder="Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </OneQuestionLayout>
          )}

          {accountIdx === 2 && (
            <OneQuestionLayout
              icon={<Mail className="h-5 w-5" />}
              title="Work email"
              description="We will use this to log you in."
              onBack={backAccount}
              onSubmit={nextAccount}
            >
              <Form {...accountForm}>
                <FormField
                  control={accountForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input autoFocus type="email" placeholder="you@company.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </OneQuestionLayout>
          )}

          {accountIdx === 3 && (
            <OneQuestionLayout
              icon={<Lock className="h-5 w-5" />}
              title="Create a password"
              description="Minimum 8 characters."
              onBack={backAccount}
              onNextLabel="Create account"
              onSubmit={doRegister}
              submitting={submittingAccount}
              nextDisabled={submittingAccount || !cfToken}
            >
              <Form {...accountForm}>
                <FormField
                  control={accountForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input autoFocus type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>

              {/* Compact Turnstile on the last account screen */}
              {siteKey ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Please complete the captcha to continue.</p>
                  <TurnstileCompact siteKey={siteKey} cData={regNonce} onToken={setCfToken} />
                </div>
              ) : (
                <p className="text-xs text-red-500">
                  TURNSTILE_SITE_KEY is missing. Set it in your environment to enable captcha.
                </p>
              )}
            </OneQuestionLayout>
          )}
        </>
      )}

      {/* ---------- STEP 2: COMPANY (one question per screen) ---------- */}
      {step === 2 && (
        <>
          {companyIdx === 0 && (
            <OneQuestionLayout
              icon={<Building2 className="h-5 w-5" />}
              title="Your company name"
              description="We will create your workspace with this name."
              onBack={() => setStep(1)}
              onSubmit={nextCompany}
            >
              <Form {...companyForm}>
                <FormField
                  control={companyForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company name</FormLabel>
                      <FormControl>
                        <Input autoFocus placeholder="Acme Inc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </OneQuestionLayout>
          )}

          {companyIdx === 1 && (
            <OneQuestionLayout
              icon={<MapPin className="h-5 w-5" />}
              title="Street and number"
              description="Where is your company located?"
              onBack={backCompany}
              onSubmit={nextCompany}
            >
              <Form {...companyForm}>
                <FormField
                  control={companyForm.control}
                  name="address_street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street</FormLabel>
                      <FormControl>
                        <Input autoFocus placeholder="Main Street 1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </OneQuestionLayout>
          )}

          {companyIdx === 2 && (
            <OneQuestionLayout
              icon={<MapPin className="h-5 w-5" />}
              title="ZIP / Postal code"
              onBack={backCompany}
              onSubmit={nextCompany}
            >
              <Form {...companyForm}>
                <FormField
                  control={companyForm.control}
                  name="address_zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP</FormLabel>
                      <FormControl>
                        <Input autoFocus placeholder="10115" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </OneQuestionLayout>
          )}

          {companyIdx === 3 && (
            <OneQuestionLayout
              icon={<MapPin className="h-5 w-5" />}
              title="City"
              onBack={backCompany}
              onSubmit={nextCompany}
            >
              <Form {...companyForm}>
                <FormField
                  control={companyForm.control}
                  name="address_city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input autoFocus placeholder="Berlin" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </OneQuestionLayout>
          )}

          {companyIdx === 4 && (
            <OneQuestionLayout
              icon={<MapPin className="h-5 w-5" />}
              title="Country"
              onBack={backCompany}
              onSubmit={nextCompany}
            >
              <Form {...companyForm}>
                <FormField
                  control={companyForm.control}
                  name="address_country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input autoFocus placeholder="Germany" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </OneQuestionLayout>
          )}

          {companyIdx === 5 && (
            <OneQuestionLayout
              icon={<Globe className="h-5 w-5" />}
              title="Company website (optional)"
              description="Add your homepage now or later in Settings."
              onBack={backCompany}
              onSubmit={nextCompany}
              extraRight={
                <Button type="button" variant="outline" onClick={skipCompanyOptional}>
                  Skip
                </Button>
              }
            >
              <Form {...companyForm}>
                <FormField
                  control={companyForm.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input autoFocus placeholder="https://example.com" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </OneQuestionLayout>
          )}

          {companyIdx === 6 && (
            <OneQuestionLayout
              icon={<Landmark className="h-5 w-5" />}
              title="VAT ID (optional)"
              description="You can add or update this later."
              onBack={backCompany}
              onNextLabel="Create company"
              onSubmit={createCompany}
              submitting={submittingCompany}
              extraRight={
                <Button type="button" variant="outline" onClick={skipCompanyOptional}>
                  Skip
                </Button>
              }
            >
              <Form {...companyForm}>
                <FormField
                  control={companyForm.control}
                  name="vat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VAT ID</FormLabel>
                      <FormControl>
                        <Input autoFocus placeholder="DE123456789" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </OneQuestionLayout>
          )}
        </>
      )}

      {/* ---------- NEXT STEPS PLACEHOLDER ---------- */}
      {step > 2 && (
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Next: Support email</CardTitle>
            <CardDescription>Choose a provider and connect your shared inbox.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button onClick={() => setStep(3)}>
              Continue
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
