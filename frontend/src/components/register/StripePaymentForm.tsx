"use client";

import React, { useState, useEffect } from 'react';
import { CheckoutProvider, PaymentElement, useCheckout } from '@stripe/react-stripe-js/checkout';
import { stripePromise } from '@/lib/stripe';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

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
  const checkoutState = useCheckout();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pricePerUser = 9.99;
  const totalPrice = (pricePerUser * quantity).toFixed(2);

  const handlePayment = async () => {
    // Type guard - only proceed if checkout is available
    if (checkoutState.type !== 'success') {
      setError('Checkout not ready');
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
          setError('Authentication lost. Please log in again.');
          setLoading(false);
          return;
        }

        // Call backend to complete subscription
        const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000/api';
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
          throw new Error(completeData.error || 'Failed to complete subscription');
        }

        console.log('[Payment] Subscription completed:', completeData.subscriptionId);
        onSuccess();
      }
    } catch (e: any) {
      setError(e?.message || 'Payment failed');
      setLoading(false);
    }
  };

  // Handle loading state
  if (checkoutState.type === 'loading') {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading payment form...</span>
      </div>
    );
  }

  // Handle error state
  if (checkoutState.type === 'error') {
    return (
      <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
        <p className="text-sm text-destructive">
          Error loading payment form: {checkoutState.error.message}
        </p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Go Back
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
          <span className="font-medium">Pro Plan</span>
          <span className="font-bold">€{totalPrice}/month</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {quantity} user{quantity > 1 ? 's' : ''} × €{pricePerUser.toFixed(2)}/month
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Your subscription will start immediately. You can cancel anytime.
        </p>
      </div>

      {/* Stripe Payment Element */}
      <div className="space-y-4">
        <label className="text-sm font-medium block">Payment Information</label>
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
          Back
        </Button>
        <Button onClick={handlePayment} disabled={loading}>
          {loading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Complete Payment
              <ChevronRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Payments are processed securely through Stripe.
      </p>
    </div>
  );
}

/**
 * Main payment form component with Stripe provider
 */
export default function StripePaymentForm({ priceId, quantity, onSuccess, onBack }: StripePaymentFormProps) {
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
          throw new Error('Not authenticated. Please complete account creation first.');
        }

        // PUBLIC_API_URL already includes /api, so we just add the specific endpoint
        const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000/api';
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
          throw new Error(data.error || 'Failed to create checkout session');
        }

        setClientSecret(data.clientSecret);
        setSessionId(data.sessionId);
      } catch (e: any) {
        console.error('[StripePaymentForm] Error initializing checkout:', e);
        setInitError(e?.message || 'Failed to initialize payment');
      } finally {
        setLoading(false);
      }
    };

    initializeCheckout();
  }, [priceId, quantity]);

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Preparing payment...</span>
      </div>
    );
  }

  // Show error state
  if (initError || !clientSecret || !sessionId) {
    return (
      <div className="space-y-4">
        <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
          <p className="text-sm text-destructive">
            {initError || 'Failed to initialize payment session'}
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Go Back
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
            Stripe is not configured. Please contact support.
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  // Render payment form with Stripe provider
  return (
    <CheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm quantity={quantity} sessionId={sessionId} onSuccess={onSuccess} onBack={onBack} />
    </CheckoutProvider>
  );
}
