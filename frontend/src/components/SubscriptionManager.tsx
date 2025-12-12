"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CreditCard, 
  Calendar, 
  Users, 
  Check, 
  AlertCircle,
  RefreshCw,
  ExternalLink 
} from 'lucide-react';
import { apiClient } from '@/utils/api';

interface Subscription {
  id: string;
  status: string;
  currentPeriodEnd: number;
  currentPeriodStart: number;
  cancelAtPeriodEnd: boolean;
  canceledAt: number | null;
  quantity: number;
  amount: number;
  currency: string;
  interval: string;
}

interface SubscriptionData {
  tier: string;
  status: string;
  subscription: Subscription | null;
}

export default function SubscriptionManager() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/client/subscription');
      console.log('[SubscriptionManager] Received data:', response);
      if (response.subscription) {
        console.log('[SubscriptionManager] Period dates:', {
          start: response.subscription.currentPeriodStart,
          end: response.subscription.currentPeriodEnd,
          startType: typeof response.subscription.currentPeriodStart,
          endType: typeof response.subscription.currentPeriodEnd
        });
      }
      setData(response);
    } catch (e: any) {
      console.error('[SubscriptionManager] Error:', e);
      setError(e?.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  };

  const openBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const response = await apiClient.post('/client/billing-portal', {});
      if (response.url) {
        window.location.href = response.url;
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to open billing portal');
      setPortalLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: any; label: string }> = {
      active: { variant: 'default', label: 'Active' },
      trialing: { variant: 'secondary', label: 'Trial' },
      past_due: { variant: 'destructive', label: 'Past Due' },
      canceled: { variant: 'outline', label: 'Canceled' },
      incomplete: { variant: 'outline', label: 'Incomplete' },
    };

    const config = statusConfig[status] || { variant: 'outline', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading subscription...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle>Error Loading Subscription</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={fetchSubscription} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const isFree = data.tier === 'free' || !data.subscription;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Subscription Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage your subscription plan and billing details
        </p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5" />
              <CardTitle>Current Plan</CardTitle>
            </div>
            {!isFree && getStatusBadge(data.status)}
          </div>
          <CardDescription>
            {isFree
              ? 'You are currently on the Free plan'
              : 'You are subscribed to the Pro plan'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isFree ? (
            <>
              <div className="space-y-2">
                <h3 className="font-semibold">Free Tier Features</h3>
                <ul className="space-y-2">
                  <li className="flex items-center text-sm">
                    <Check className="h-4 w-4 mr-2 text-primary" />
                    1 user account
                  </li>
                  <li className="flex items-center text-sm">
                    <Check className="h-4 w-4 mr-2 text-primary" />
                    Send up to 50 emails/month
                  </li>
                  <li className="flex items-center text-sm">
                    <Check className="h-4 w-4 mr-2 text-primary" />
                    Basic support
                  </li>
                </ul>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  Upgrade to Pro for unlimited users and emails
                </p>
                <Button onClick={() => window.location.href = '/register?upgrade=true'}>
                  Upgrade to Pro Plan
                </Button>
              </div>
            </>
          ) : data.subscription ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Price</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(data.subscription.amount, data.subscription.currency)}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{data.subscription.interval}
                    </span>
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    Users
                  </p>
                  <p className="text-2xl font-bold">{data.subscription.quantity}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    Current Period
                  </p>
                  <p className="text-sm">
                    {formatDate(data.subscription.currentPeriodStart)} -{' '}
                    {formatDate(data.subscription.currentPeriodEnd)}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(
                      data.subscription.amount * data.subscription.quantity,
                      data.subscription.currency
                    )}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{data.subscription.interval}
                    </span>
                  </p>
                </div>
              </div>

              {data.subscription.cancelAtPeriodEnd && (
                <div className="p-3 border border-yellow-500 rounded-lg bg-yellow-50 dark:bg-yellow-950">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <AlertCircle className="h-4 w-4 inline mr-2" />
                    Your subscription will cancel on{' '}
                    {formatDate(data.subscription.currentPeriodEnd)}
                  </p>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Manage Subscription</h3>
                  <p className="text-sm text-muted-foreground">
                    Update payment method, billing details, or cancel subscription
                  </p>
                </div>
                <Button onClick={openBillingPortal} disabled={portalLoading}>
                  {portalLoading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Manage Billing
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Pro Features */}
      {!isFree && (
        <Card>
          <CardHeader>
            <CardTitle>Pro Plan Features</CardTitle>
            <CardDescription>Everything included in your subscription</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <li className="flex items-center text-sm">
                <Check className="h-4 w-4 mr-2 text-primary flex-shrink-0" />
                Unlimited users
              </li>
              <li className="flex items-center text-sm">
                <Check className="h-4 w-4 mr-2 text-primary flex-shrink-0" />
                Unlimited emails
              </li>
              <li className="flex items-center text-sm">
                <Check className="h-4 w-4 mr-2 text-primary flex-shrink-0" />
                Priority support
              </li>
              <li className="flex items-center text-sm">
                <Check className="h-4 w-4 mr-2 text-primary flex-shrink-0" />
                Advanced analytics
              </li>
              <li className="flex items-center text-sm">
                <Check className="h-4 w-4 mr-2 text-primary flex-shrink-0" />
                Custom integrations
              </li>
              <li className="flex items-center text-sm">
                <Check className="h-4 w-4 mr-2 text-primary flex-shrink-0" />
                Team collaboration
              </li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
