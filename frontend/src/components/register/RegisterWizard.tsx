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
  Inbox,
  ServerCog,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  Trash2,
  CreditCard,
  Check,
  Zap,
} from "lucide-react";

// shadcn/ui
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// Stripe payment form
import StripePaymentForm from "./StripePaymentForm";

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
   STEP 3: Support mailbox schema
   ========================= */
const supportSchema = z.object({
  provider_id: z.coerce.number().int().positive("Choose a provider."),
  email_address: z.string().email("Please enter a valid email."),
  password: z.string().min(1, "Please enter the mailbox password."),
  imap: z.string().min(1, "IMAP host required."),
  imap_port: z.coerce.number().int().min(1),
  smtp: z.string().min(1, "SMTP host required."),
  smtp_port: z.coerce.number().int().min(1),
});
type SupportFormData = z.infer<typeof supportSchema>;

/* =========================
   STEP 4: Team invite schema
   ========================= */
const teamMemberSchema = z.object({
  email: z.string().email("Please enter a valid email."),
  name: z.string().min(1, "Please enter a name."),
  role_id: z.coerce.number().int().positive("Please select a role."),
});
type TeamMemberData = z.infer<typeof teamMemberSchema>;

/* =========================
   Turnstile (sichtbar, normal)
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

  // Check for payment success on mount
  React.useEffect(() => {
    const handlePaymentReturn = async () => {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const paymentStatus = urlParams.get('payment');
        const sessionId = urlParams.get('session_id');
        
        if (paymentStatus === 'success') {
          // Payment completed via redirect - complete subscription on backend
          if (sessionId) {
            try {
              const { actions } = await import("astro:actions");
              // We need to call the backend directly to complete subscription
              const { createBrowserClient } = await import('@supabase/ssr');
              const supabase = createBrowserClient(
                import.meta.env.PUBLIC_SUPABASE_URL!,
                import.meta.env.PUBLIC_SUPABASE_ANON_KEY!
              );
              
              const { data: { session } } = await supabase.auth.getSession();
              
              if (session) {
                const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000/api';
                await fetch(`${apiUrl}/client/complete-subscription`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({ sessionId }),
                  credentials: 'include',
                });
              }
            } catch (e) {
              console.error('[RegisterWizard] Failed to complete subscription:', e);
            }
          }
          
          // Payment completed successfully, go to completion step
          setStep(7);
          // Clean up URL
          window.history.replaceState({}, '', '/register');
        }
      }
    };
    
    handlePaymentReturn();
  }, []);

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
    // If we're on the VAT step (6), proceed to create company
    if (companyIdx === 6) {
      createCompany();
    } else {
      // Otherwise just skip to next step
      setCompanyIdx((i) => Math.min(6, i + 1));
    }
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
      setStep(3); // proceed to Support email
    } catch (e: any) {
      alert(e?.message ?? "Unexpected error");
    } finally {
      setSubmittingCompany(false);
    }
  };

  /* ---- Step 3 (Support email) ---- */
  type Provider = {
    id: number;
    name: string;
    logo_url?: string | null;
    imap: string;
    imap_port: number;
    smtp: string;
    smtp_port: number;
  };

  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [supportIdx, setSupportIdx] = useState<number>(0); // 0..4
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const [testStatus, setTestStatus] = useState<null | { ok: boolean; message?: string }>(null);
  const [clientEmailId, setClientEmailId] = useState<number | null>(null);
  const supStorageKey = useMemo(() => `reg:${regNonce}:support`, [regNonce]);

  const supportForm = useForm<SupportFormData>({
    resolver: zodResolver(supportSchema),
    defaultValues: (() => {
      if (typeof window !== "undefined") {
        const raw = localStorage.getItem(supStorageKey);
        if (raw) {
          try {
            return JSON.parse(raw) as SupportFormData;
          } catch {}
        }
      }
      return {
        provider_id: 0 as any,
        email_address: "",
        password: "",
        imap: "",
        imap_port: 993,
        smtp: "",
        smtp_port: 587,
      };
    })(),
    mode: "onBlur",
  });

  React.useEffect(() => {
    const sub = supportForm.watch((values) => {
      try {
        localStorage.setItem(supStorageKey, JSON.stringify(values));
      } catch {}
    });
    return () => sub.unsubscribe();
  }, [supportForm, supStorageKey]);

  React.useEffect(() => {
    if (step !== 3) return;
    (async () => {
      setLoadingProviders(true);
      try {
        const { actions } = await import("astro:actions");
        const res = await actions.getEmailProviders({});
        if (res?.data?.success && Array.isArray(res.data.providers)) {
          setProviders(res.data.providers);
          // defaults einmalig setzen
          const current = supportForm.getValues("provider_id");
          if (!current && res.data.providers.length > 0) {
            const p = res.data.providers[0];
            supportForm.setValue("provider_id", p.id);
            supportForm.setValue("imap", p.imap);
            supportForm.setValue("imap_port", p.imap_port);
            supportForm.setValue("smtp", p.smtp);
            supportForm.setValue("smtp_port", p.smtp_port);
          }
        }
      } catch (e) {
        console.error("Failed to load providers", e);
      } finally {
        setLoadingProviders(false);
      }
    })();
  }, [step, supportForm]);

  const onSelectProvider = (idStr: string) => {
    const id = Number(idStr);
    supportForm.setValue("provider_id", id);
    const p = providers.find((x) => x.id === id);
    if (p) {
      supportForm.setValue("imap", p.imap);
      supportForm.setValue("imap_port", p.imap_port);
      supportForm.setValue("smtp", p.smtp);
      supportForm.setValue("smtp_port", p.smtp_port);
    }
  };

  const backSupport = () => {
    if (supportIdx > 0) setSupportIdx((i) => i - 1);
    else setStep(2);
  };

  const nextSupport = async () => {
    const fields: (keyof SupportFormData)[] = [
      "provider_id",
      "email_address",
      "password",
      "imap", // advanced screen validiert alle advanced Felder in einem Rutsch
    ];
    const fieldName = fields[supportIdx];
    if (supportIdx === 3) {
      // advanced: validiere alle advanced Felder
      const ok = await supportForm.trigger([
        "imap",
        "imap_port",
        "smtp",
        "smtp_port",
      ]);
      if (!ok) return;
      return onSaveAndTest();
    } else {
      const ok = await supportForm.trigger(fieldName);
      if (!ok) return;
      setSupportIdx((i) => Math.min(4, i + 1));
    }
  };

  const onSaveAndTest = async () => {
    setSubmittingSupport(true);
    setTestStatus(null);
    try {
      const { actions } = await import("astro:actions");
      // 1) speichern
      const createRes = await actions.registerCreateSupportMailbox({
        provider_id: supportForm.getValues("provider_id"),
        email_address: supportForm.getValues("email_address"),
        password: supportForm.getValues("password"),
        imap: supportForm.getValues("imap"),
        imap_port: supportForm.getValues("imap_port"),
        smtp: supportForm.getValues("smtp"),
        smtp_port: supportForm.getValues("smtp_port"),
      });
      if (!createRes?.data?.success || !createRes.data.client_email_id) {
        throw new Error(createRes?.data?.message || "Could not save mailbox");
      }
      setClientEmailId(createRes.data.client_email_id);

      // 2) Test connection with credentials directly
      const testRes = await actions.registerTestSupportMailbox({
        email_address: supportForm.getValues("email_address"),
        password: supportForm.getValues("password"),
        imap: supportForm.getValues("imap"),
        imap_port: supportForm.getValues("imap_port"),
        smtp: supportForm.getValues("smtp"),
        smtp_port: supportForm.getValues("smtp_port"),
      });
      if (testRes?.data?.success) {
        setTestStatus({ ok: true, message: "Connection successful." });
      } else {
        setTestStatus({ ok: false, message: (testRes?.data as any)?.message || "Connection failed." });
      }
      setSupportIdx(4); // Ergebnis-Screen
    } catch (e: any) {
      setTestStatus({ ok: false, message: e?.message || "Unexpected error" });
      setSupportIdx(4);
    } finally {
      setSubmittingSupport(false);
    }
  };

  /* ---- Step 4 (Team invites) ---- */
  const [teamMembers, setTeamMembers] = useState<TeamMemberData[]>([]);
  const [currentMember, setCurrentMember] = useState<TeamMemberData>({
    email: "",
    name: "",
    role_id: 2, // Default to regular user (role_id = 2)
  });
  const [submittingTeam, setSubmittingTeam] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  const roles = [
    { id: 1, name: "Admin" },
    { id: 2, name: "User" },
  ];

  const handleAddMember = () => {
    // Validate current member
    try {
      teamMemberSchema.parse(currentMember);
      // Check for duplicate emails
      if (teamMembers.some(m => m.email.toLowerCase() === currentMember.email.toLowerCase())) {
        alert("This email has already been added.");
        return;
      }
      setTeamMembers([...teamMembers, currentMember]);
      setCurrentMember({ email: "", name: "", role_id: 2 });
    } catch (e: any) {
      if (e.errors && e.errors.length > 0) {
        alert(e.errors[0].message);
      } else {
        alert("Please fill in all fields correctly.");
      }
    }
  };

  const handleRemoveMember = (index: number) => {
    setTeamMembers(teamMembers.filter((_, i) => i !== index));
  };

  const handleInviteTeam = async () => {
    if (teamMembers.length === 0) {
      // Skip if no members added
      setStep(5);
      return;
    }

    setSubmittingTeam(true);
    try {
      const { actions } = await import("astro:actions");
      const results = [];
      
      for (const member of teamMembers) {
        const formData = new FormData();
        formData.append('email', member.email);
        formData.append('name', member.name);
        formData.append('role_id', member.role_id.toString());
        
        const result = await actions.createEmployee(formData);
        results.push({ member, result });
      }

      // Check if any failed
      const failed = results.filter(r => !r.result?.data?.success);
      if (failed.length > 0) {
        const failedEmails = failed.map(f => f.member.email).join(", ");
        alert(`Some invites failed: ${failedEmails}`);
      }

      // Move to payment plan selection
      setStep(5);
    } catch (e: any) {
      alert(e?.message || "Unexpected error inviting team members");
    } finally {
      setSubmittingTeam(false);
    }
  };

  /* ---- Step 5 (Payment Plan) ---- */
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'paid' | null>(null);

  const plans = [
    {
      id: 'free' as const,
      name: 'Free Tier',
      price: '€0',
      features: [
        '1 user account',
        'Send up to 50 emails/month',
        'Basic support',
        'Email management',
      ],
    },
    {
      id: 'paid' as const,
      name: 'Pro Plan',
      price: '€9.99',
      priceNote: 'per user/month',
      features: [
        'Unlimited users',
        'Unlimited emails',
        'Priority support',
        'Advanced analytics',
        'Custom integrations',
      ],
    },
  ];

  const handlePlanSelection = (planId: 'free' | 'paid') => {
    setSelectedPlan(planId);
    if (planId === 'free') {
      // Skip payment, go to completion
      setStep(7);
    } else {
      // Go to payment details
      setStep(6);
    }
  };

  /* ---- Step 6 (Payment Details) ---- */
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Stripe Price ID - should be set in environment variables
  // For now, using a placeholder - replace with actual price ID from Stripe Dashboard
  const STRIPE_PRICE_ID = import.meta.env.PUBLIC_STRIPE_PRICE_ID || 'price_placeholder';

  const handlePaymentSuccess = () => {
    // Payment completed successfully, move to completion
    setStep(7);
  };

  const handlePaymentSubmit = async () => {
    setProcessingPayment(true);
    setPaymentError(null);
    
    try {
      // TODO: Implement Stripe payment processing
      // For now, just simulate success
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Move to completion
      setStep(7);
    } catch (e: any) {
      setPaymentError(e?.message || "Payment failed");
    } finally {
      setProcessingPayment(false);
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
          {/* (unchanged) */}
          {/* ... alle vier Micro-Screens aus deinem aktuellen Code ... */}
          {/* First name */}
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
          {/* Last name */}
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
          {/* Email */}
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
          {/* Password + Turnstile */}
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
          {/* (unchanged, exakt wie in deiner Datei) */}
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

      {/* ---------- STEP 3: SUPPORT EMAIL ---------- */}
      {step === 3 && (
        <>
          {/* 0) Provider auswählen */}
          {supportIdx === 0 && (
            <OneQuestionLayout
              icon={<Inbox className="h-5 w-5" />}
              title="Choose your email provider"
              description="We will prefill IMAP/SMTP using this provider."
              onBack={() => setStep(2)}
              onSubmit={nextSupport}
              nextDisabled={loadingProviders}
            >
              {loadingProviders ? (
                <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              ) : (
                <Form {...supportForm}>
                  <FormField
                    control={supportForm.control}
                    name="provider_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provider</FormLabel>
                        <Select value={String(field.value || "")} onValueChange={onSelectProvider}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a provider" />
                          </SelectTrigger>
                          <SelectContent>
                            {providers.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </Form>
              )}
            </OneQuestionLayout>
          )}

          {/* 1) Support E-Mail */}
          {supportIdx === 1 && (
            <OneQuestionLayout
              icon={<Mail className="h-5 w-5" />}
              title="Support email address"
              description="This will be the shared mailbox for your helpdesk."
              onBack={backSupport}
              onSubmit={nextSupport}
            >
              <Form {...supportForm}>
                <FormField
                  control={supportForm.control}
                  name="email_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input autoFocus type="email" placeholder="support@yourcompany.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            </OneQuestionLayout>
          )}

          {/* 2) Passwort */}
          {supportIdx === 2 && (
            <OneQuestionLayout
              icon={<Lock className="h-5 w-5" />}
              title="Mailbox password"
              description="Dev only: stored in plaintext. We will hash & encrypt in production."
              onBack={backSupport}
              onSubmit={nextSupport}
            >
              <Form {...supportForm}>
                <FormField
                  control={supportForm.control}
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
            </OneQuestionLayout>
          )}

          {/* 3) Advanced (IMAP/SMTP) */}
          {supportIdx === 3 && (
            <OneQuestionLayout
              icon={<ServerCog className="h-5 w-5" />}
              title="Advanced (optional)"
              description="IMAP/SMTP settings are prefilled from your provider. Adjust only if needed."
              onBack={backSupport}
              onNextLabel="Save & test"
              onSubmit={nextSupport}
              submitting={submittingSupport}
            >
              <Form {...supportForm}>
                {/* IMAP */}
                <div className="grid grid-cols-1 gap-3">
                  <FormItem>
                    <FormLabel className="text-xs uppercase text-muted-foreground">IMAP</FormLabel>
                  </FormItem>
                  <FormField
                    control={supportForm.control}
                    name="imap"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Host</FormLabel>
                        <FormControl>
                          <Input autoFocus placeholder="imap.example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-3">
                    <FormField
                      control={supportForm.control}
                      name="imap_port"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>Port</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="993" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* SMTP */}
                  <FormItem className="mt-4">
                    <FormLabel className="text-xs uppercase text-muted-foreground">SMTP</FormLabel>
                  </FormItem>
                  <FormField
                    control={supportForm.control}
                    name="smtp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Host</FormLabel>
                        <FormControl>
                          <Input placeholder="smtp.example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-3">
                    <FormField
                      control={supportForm.control}
                      name="smtp_port"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>Port</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="587" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </Form>
            </OneQuestionLayout>
          )}

          {/* 4) Testergebnis */}
          {supportIdx === 4 && (
            <Card className="w-full max-w-md shadow-lg">
              <CardHeader className="text-center space-y-2">
                {testStatus?.ok ? (
                  <div className="mx-auto h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                ) : (
                  <div className="mx-auto h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-600 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                )}
                <CardTitle className="text-xl">
                  {testStatus?.ok ? "Mailbox connected" : "Connection failed"}
                </CardTitle>
                <CardDescription className="text-sm">
                  {testStatus?.message || (testStatus?.ok ? "Connection successful." : "Please review your settings.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setSupportIdx(3)}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                {testStatus?.ok ? (
                  <Button onClick={() => setStep(4)}>
                    Continue
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={onSaveAndTest} disabled={submittingSupport}>
                    Retry test
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ---------- STEP 4: TEAM INVITES ---------- */}
      {step === 4 && (
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <div className="flex items-center space-x-2 mb-2">
              <UserPlus className="h-5 w-5" />
              <CardTitle className="text-xl">Invite Your Team</CardTitle>
            </div>
            <CardDescription>
              Add team members now or skip and do it later from the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Add Member Form */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <div className="grid gap-3">
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={currentMember.email}
                    onChange={(e) => setCurrentMember({ ...currentMember, email: e.target.value })}
                    disabled={submittingTeam}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    type="text"
                    placeholder="John Doe"
                    value={currentMember.name}
                    onChange={(e) => setCurrentMember({ ...currentMember, name: e.target.value })}
                    disabled={submittingTeam}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Role</label>
                  <Select
                    value={currentMember.role_id.toString()}
                    onValueChange={(value) => setCurrentMember({ ...currentMember, role_id: Number(value) })}
                    disabled={submittingTeam}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id.toString()}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleAddMember}
                disabled={submittingTeam}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Team Member
              </Button>
            </div>

            {/* Team Members List */}
            {teamMembers.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Team Members ({teamMembers.length})</h4>
                <div className="space-y-2">
                  {teamMembers.map((member, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg bg-background"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {roles.find(r => r.id === member.role_id)?.name}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMember(index)}
                        disabled={submittingTeam}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(3)} disabled={submittingTeam}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setStep(5)}
                  disabled={submittingTeam}
                >
                  Skip
                </Button>
                <Button
                  onClick={handleInviteTeam}
                  disabled={submittingTeam || teamMembers.length === 0}
                >
                  {submittingTeam ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Inviting...
                    </>
                  ) : (
                    <>
                      Invite {teamMembers.length} {teamMembers.length === 1 ? 'Member' : 'Members'}
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- STEP 5: PAYMENT PLAN ---------- */}
      {step === 5 && (
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <div className="flex items-center space-x-2 mb-2">
              <CreditCard className="h-5 w-5" />
              <CardTitle className="text-xl">Choose Your Plan</CardTitle>
            </div>
            <CardDescription>
              Select the plan that best fits your needs. You can upgrade anytime.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "border rounded-lg p-4 cursor-pointer transition-all",
                  selectedPlan === plan.id
                    ? "border-primary bg-primary/5 ring-2 ring-primary"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => setSelectedPlan(plan.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold">{plan.price}</span>
                      {plan.priceNote && (
                        <span className="text-sm text-muted-foreground">{plan.priceNote}</span>
                      )}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "h-5 w-5 rounded-full border-2 flex items-center justify-center",
                      selectedPlan === plan.id
                        ? "border-primary bg-primary"
                        : "border-muted-foreground"
                    )}
                  >
                    {selectedPlan === plan.id && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>
                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center text-sm">
                      <Check className="h-4 w-4 mr-2 text-primary flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(4)}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => selectedPlan && handlePlanSelection(selectedPlan)}
                disabled={!selectedPlan}
              >
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- STEP 6: PAYMENT DETAILS ---------- */}
      {step === 6 && (
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <div className="flex items-center space-x-2 mb-2">
              <CreditCard className="h-5 w-5" />
              <CardTitle className="text-xl">Payment Details</CardTitle>
            </div>
            <CardDescription>
              Enter your payment information to complete the subscription.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StripePaymentForm
              priceId={STRIPE_PRICE_ID}
              quantity={teamMembers.length + 1}
              onSuccess={handlePaymentSuccess}
              onBack={() => setStep(5)}
            />
          </CardContent>
        </Card>
      )}

      {/* ---------- COMPLETION ---------- */}
      {step > 6 && (
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl">Registration Complete!</CardTitle>
            <CardDescription className="text-base">
              Your account and company have been successfully set up.
              {teamMembers.length > 0 && (
                <> {teamMembers.length} team {teamMembers.length === 1 ? 'member has' : 'members have'} been invited.</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              className="w-full" 
              size="lg"
              onClick={() => {
                // Clear all registration data
                try {
                  localStorage.removeItem(accStorageKey);
                  localStorage.removeItem(compStorageKey);
                  localStorage.removeItem(supStorageKey);
                } catch {}
                // Redirect to dashboard
                window.location.href = '/dashboard';
              }}
            >
              Go to Dashboard
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              You can configure additional settings and add more team members from the dashboard.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
