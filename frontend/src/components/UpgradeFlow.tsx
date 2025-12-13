"use client";

import React, { useState, useEffect } from 'react';
import { CheckoutProvider, PaymentElement, useCheckout } from '@stripe/react-stripe-js/checkout';
import { stripePromise } from '@/lib/stripe';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, RefreshCw, Sparkles, Check } from 'lucide-react';
import { apiClient } from '@/utils/api';

interface UpgradeFlowProps {
  priceId: string;
  quantity: number;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Inner checkout form component
 */
function CheckoutForm({ 
  quantity, 
  sessionId, 
  onSuccess, 
  onCancel 
}: { 
  quantity: number; 
  sessionId: string;
  onSuccess: () => void; 
  onCancel: () => void;
}) {
  const checkoutState = useCheckout();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pricePerUser = 9.99;
  const totalPrice = (pricePerUser * quantity).toFixed(2);

  const handlePayment = async () => {
    if (checkoutState.type !== 'success') {
      setError('Checkout not ready');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await checkoutState.checkout.confirm();
      
      if (result.type === 'error') {
        setError(result.error.message);
        setLoading(false);
      } else {
        // Payment successful - complete subscription on backend
        const completeResponse = await apiClient.post('/client/complete-subscription', {
          sessionId
        });

        if (!completeResponse.success) {
          throw new Error(completeResponse.error || 'Failed to complete subscription');
        }

        console.log('[Upgrade] Subscription completed:', completeResponse.subscriptionId);
        onSuccess();
      }
    } catch (e: any) {
      console.error('[Upgrade] Payment error:', e);
      setError(e?.message || 'Payment failed');
      setLoading(false);
    }
  };

  if (checkoutState.type === 'loading') {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading payment form...</span>
      </div>
    );
  }

  if (checkoutState.type === 'error') {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Payment</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {checkoutState.error.message}
          </p>
          <Button onClick={onCancel} variant="outline">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pro Plan Summary</CardTitle>
          <CardDescription>
            Upgrade to unlock unlimited users and emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center text-sm">
              <Check className="h-4 w-4 mr-2 text-primary" />
              <span>Unlimited user accounts</span>
            </div>
            <div className="flex items-center text-sm">
              <Check className="h-4 w-4 mr-2 text-primary" />
              <span>Unlimited emails per month</span>
            </div>
            <div className="flex items-center text-sm">
              <Check className="h-4 w-4 mr-2 text-primary" />
              <span>Priority support</span>
            </div>
            <div className="flex items-center text-sm">
              <Check className="h-4 w-4 mr-2 text-primary" />
              <span>Advanced analytics</span>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">Users</span>
              <span className="font-medium">{quantity}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">Price per user</span>
              <span className="font-medium">€{pricePerUser.toFixed(2)}/month</span>
            </div>
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Total</span>
              <span>€{totalPrice}/month</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentElement />
          {error && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          onClick={onCancel}
          variant="outline"
          disabled={loading}
          className="flex-1"
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <Button
          onClick={handlePayment}
          disabled={loading}
          className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
        >
          {loading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Complete Upgrade
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Main UpgradeFlow component
 */
export default function UpgradeFlow({ priceId, quantity, onSuccess, onCancel }: UpgradeFlowProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initCheckout();
  }, [priceId, quantity]);

  const initCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('[UpgradeFlow] Creating checkout session with:', { priceId, quantity });
      
      const response = await apiClient.post('/client/upgrade-checkout-session', {
        priceId,
        quantity
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to create checkout session');
      }

      console.log('[UpgradeFlow] Checkout session created:', response.sessionId);
      setClientSecret(response.clientSecret);
      setSessionId(response.sessionId);
    } catch (e: any) {
      console.error('[UpgradeFlow] Error initializing checkout:', e);
      setError(e?.message || 'Failed to initialize payment');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Initializing payment...</span>
      </div>
    );
  }

  if (error || !clientSecret || !sessionId) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {error || 'Failed to initialize payment'}
          </p>
          <div className="flex gap-3">
            <Button onClick={onCancel} variant="outline">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
            <Button onClick={initCheckout} variant="default">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <CheckoutProvider
      stripe={stripePromise}
      options={{ clientSecret }}
    >
      <CheckoutForm
        quantity={quantity}
        sessionId={sessionId}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </CheckoutProvider>
  );
}
