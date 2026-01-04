"use client";

import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/utils/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

interface NewEmailPopoverProps {
  from: string;
}

export function NewEmailPopover({ from }: NewEmailPopoverProps) {
  const { t } = useTranslation('dashboard');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return isValidEmail(email.trim()) && subject.trim().length > 0 && !isSubmitting;
  }, [email, subject, isSubmitting]);

  const handleStart = async () => {
    setError(null);

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    const trimmedSubject = subject.trim();

    if (!isValidEmail(trimmedEmail)) {
      setError(t('newEmail.validEmailError'));
      return;
    }

    if (!trimmedSubject) {
      setError(t('newEmail.subjectRequired'));
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await apiClient.post("/customers/upsertByEmail", {
        email: trimmedEmail,
        name: trimmedName || null,
      });

      const customerId = result?.customerId;
      if (!customerId) {
        throw new Error("Failed to create or find customer");
      }

      const nextUrl = new URL(window.location.origin + `/tickets/${customerId}`);
      nextUrl.searchParams.set("compose", "1");
      nextUrl.searchParams.set("subject", trimmedSubject);
      nextUrl.searchParams.set("to", trimmedEmail);
      nextUrl.searchParams.set("from", from);

      console.log('[NewEmailPopover] Navigating to:', nextUrl.toString());

      // Navigate to the normal ticket view (thread + reply + sidebar/macros).
      window.location.href = nextUrl.toString();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('newEmail.failedToStart'));
      setIsSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="cursor-pointer">{t('newEmail.button')}</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium">{t('newEmail.title')}</div>
            <div className="text-xs text-muted-foreground">{t('newEmail.description')}</div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="new-email-name">{t('newEmail.nameLabel')}</Label>
              <Input
                id="new-email-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('newEmail.namePlaceholder')}
                autoComplete="name"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="new-email-email">{t('newEmail.emailLabel')}</Label>
              <Input
                id="new-email-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('newEmail.emailPlaceholder')}
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="new-email-subject">{t('newEmail.subjectLabel')}</Label>
              <Input
                id="new-email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('newEmail.subjectPlaceholder')}
              />
            </div>

            <div className="pt-1">
              <Button onClick={handleStart} disabled={!canSubmit} className="cursor-pointer w-full">
                {isSubmitting ? t('newEmail.starting') : t('newEmail.startButton')}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
