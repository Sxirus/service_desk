"use client";

import React, { useState, useEffect } from 'react';
import { CheckoutProvider, PaymentElement, useCheckout } from '@stripe/react-stripe-js/checkout';
import { stripePromise } from '@/lib/stripe';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useTranslation } from 'react-i18next';
import { getApiUrl } from "@/lib/api-config";

interface StripePaymentFormProps {
  priceId: string;
  quantity: number;
  onSuccess: () => void;
  onBack: () => void;
}

/**
 * Inner form component that uses Stripe checkout context
 */
function CheckoutForm({ 
  quantity, 
  sessionId, 
  onSuccess, 
  onBack 
}: { 
  quantity: number; 
  sessionId: string;
  onSuccess: () => void; 
  onBack: () => void 
}) {
  const { t } = useTranslation(['auth', 'common']);
  const checkoutState = useCheckout();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pricePerUser = 9.99;
  const totalPrice = (pricePerUser * quantity).toFixed(2);

  const handlePayment = async () => {
    // Type guard - only proceed if checkout is available
    if (checkoutState.type !== 'success') {
      setError(t('auth:wizard.payment.checkoutNotReady'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // checkoutState.type === 'success', so checkout is available
      const result = await checkoutState.checkout.confirm();
      
      if (result.type === 'error') {
        setError(result.error.message);
        setLoading(false);
      } else {
        // Payment successful - now complete the subscription on backend
        const supabase = createBrowserClient(
          import.meta.env.PUBLIC_SUPABASE_URL!,
          import.meta.env.PUBLIC_SUPABASE_ANON_KEY!
        );
        
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setError(t('auth:wizard.payment.authenticationLost'));
          setLoading(false);
          return;
        }

        // Call backend to complete subscription
        const apiUrl = getApiUrl('/api');
        const completeResponse = await fetch(`${apiUrl}/client/complete-subscription`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ sessionId }),
          credentials: 'include',
        });

        const completeData = await completeResponse.json();

        if (!completeResponse.ok || !completeData.success) {
          throw new Error(completeData.error || t('auth:wizard.payment.initializationFailed'));
        }

        console.log('[Payment] Subscription completed:', completeData.subscriptionId);
        onSuccess();
      }
    } catch (e: any) {
      setError(e?.message || t('auth:wizard.payment.paymentFailed'));
      setLoading(false);
    }
  };

  // Handle loading state
  if (checkoutState.type === 'loading') {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">{t('auth:wizard.payment.loadingPaymentForm')}</span>
      </div>
    );
  }

  // Handle error state
  if (checkoutState.type === 'error') {
    return (
      <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
        <p className="text-sm text-destructive">
          {t('auth:wizard.payment.errorLoadingForm', { message: checkoutState.error.message })}
        </p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ChevronLeft className="mr-2 h-4 w-4" />
          {t('auth:wizard.payment.goBack')}
        </Button>
      </div>
    );
  }

  // Success state - checkoutState.type === 'success', render payment form
  return (
    <div className="space-y-6">
      {/* Payment summary */}
      <div className="p-4 border rounded-lg bg-muted/50">
        <div className="flex justify-between items-center mb-2">
          <span className="font-medium">{t('auth:wizard.payment.proPlan')}</span>
          <span className="font-bold">{t('auth:wizard.payment.pricePerMonth', { total: totalPrice })}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('auth:wizard.payment.userCount', { count: quantity, price: pricePerUser.toFixed(2) })}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {t('auth:wizard.payment.subscriptionNote')}
        </p>
      </div>

      {/* Stripe Payment Element */}
      <div className="space-y-4">
        <label className="text-sm font-medium block">{t('auth:wizard.payment.paymentInformation')}</label>
        <PaymentElement options={{ layout: 'accordion' }} />
      </div>

      {/* Error display */}
      {error && (
        <div className="p-3 border border-destructive rounded-lg bg-destructive/10">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={loading}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          {t('auth:wizard.payment.back')}
        </Button>
        <Button onClick={handlePayment} disabled={loading}>
          {loading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              {t('auth:wizard.payment.processing')}
            </>
          ) : (
            <>
              {t('auth:wizard.payment.completePayment')}
              <ChevronRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        {t('auth:wizard.payment.securePayment')}
      </p>
    </div>
  );
}

/**
 * Main payment form component with Stripe provider
 */
export default function StripePaymentForm({ priceId, quantity, onSuccess, onBack }: StripePaymentFormProps) {
  const { t } = useTranslation(['auth', 'common']);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch checkout session from backend
    const initializeCheckout = async () => {
      try {
        // Get Supabase session for authentication
        const supabase = createBrowserClient(
          import.meta.env.PUBLIC_SUPABASE_URL!,
          import.meta.env.PUBLIC_SUPABASE_ANON_KEY!
        );
        
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          throw new Error('NOT_AUTHENTICATED');
        }

        // PUBLIC_API_URL already includes /api, so we just add the specific endpoint
        const apiUrl = getApiUrl('/api');
        const response = await fetch(`${apiUrl}/client/create-checkout-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`, // Add auth token
          },
          body: JSON.stringify({ priceId, quantity }),
          credentials: 'include', // Important for auth cookies
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'FAILED_TO_CREATE_SESSION');
        }

        setClientSecret(data.clientSecret);
        setSessionId(data.sessionId);
      } catch (e: any) {
        console.error('[StripePaymentForm] Error initializing checkout:', e);
        setInitError(e?.message || 'FAILED_TO_INITIALIZE');
      } finally {
        setLoading(false);
      }
    };

    initializeCheckout();
  }, [priceId, quantity]);

  // Helper to translate error codes
  const getErrorMessage = (errorCode: string | null) => {
    if (!errorCode) return t('auth:wizard.payment.initializationFailed');
    switch (errorCode) {
      case 'NOT_AUTHENTICATED':
        return t('auth:wizard.payment.notAuthenticated');
      case 'FAILED_TO_CREATE_SESSION':
        return t('auth:wizard.payment.initializationFailed');
      case 'FAILED_TO_INITIALIZE':
        return t('auth:wizard.payment.failedToInitialize');
      default:
        return errorCode;
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">{t('auth:wizard.payment.preparingPayment')}</span>
      </div>
    );
  }

  // Show error state
  if (initError || !clientSecret || !sessionId) {
    return (
      <div className="space-y-4">
        <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
          <p className="text-sm text-destructive">
            {getErrorMessage(initError)}
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          {t('auth:wizard.payment.goBack')}
        </Button>
      </div>
    );
  }

  // Stripe not configured
  if (!stripePromise) {
    return (
      <div className="space-y-4">
        <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
          <p className="text-sm text-destructive">
            {t('auth:wizard.payment.stripeNotConfigured')}
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          {t('auth:wizard.payment.goBack')}
        </Button>
      </div>
    );
  }

  return (
    <CheckoutProvider
      stripe={stripePromise}
      options={{ clientSecret }}
    >
      <CheckoutForm
        quantity={quantity}
        sessionId={sessionId as string}
        onSuccess={onSuccess}
        onBack={onBack}
      />
    </CheckoutProvider>
  );
}
