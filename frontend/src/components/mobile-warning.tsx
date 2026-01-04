// components/mobile-warning.tsx
"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MobileWarning() {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check if warning was previously dismissed
      const dismissed = window.localStorage.getItem("mobile-warning-dismissed");
      if (dismissed) {
        setIsDismissed(true);
        return;
      }

      // Check if viewport is mobile-sized
      const checkMobile = () => {
        setIsVisible(window.innerWidth < 768); // Tailwind's md breakpoint
      };

      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("mobile-warning-dismissed", "true");
    }
  };

  if (!isVisible || isDismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Alert variant="destructive" className="relative">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t('mobileWarning.title')}</AlertTitle>
        <AlertDescription>
          {t('mobileWarning.subtitle')}
        </AlertDescription>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 h-6 w-6"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    </div>
  );
}