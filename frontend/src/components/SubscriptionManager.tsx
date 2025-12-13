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
  ExternalLink,
  Sparkles 
} from 'lucide-react';
import { apiClient } from '@/utils/api';
import UpgradeFlow from '@/components/UpgradeFlow';

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

interface UsageStats {
  activeEmployees: number;
  emailsSentThisMonth: number;
  limits: {
    maxEmployees: number;
    maxEmailsPerMonth: number;
  };
}

export default function SubscriptionManager() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeQuantity, setUpgradeQuantity] = useState(1);

  useEffect(() => {
    const handleUpgradeReturn = async () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session_id');
      
      if (params.get('upgrade') === 'success' && sessionId) {
        // Complete the subscription in the database
        try {
          console.log('[SubscriptionManager] Completing subscription with session:', sessionId);
          const completeResponse = await apiClient.post('/client/complete-subscription', {
            sessionId
          });

          if (!completeResponse.success) {
            console.error('[SubscriptionManager] Failed to complete subscription:', completeResponse.error);
            setError(completeResponse.error || 'Failed to complete subscription');
          } else {
            console.log('[SubscriptionManager] Subscription completed successfully');
          }
        } catch (e: any) {
          console.error('[SubscriptionManager] Error completing subscription:', e);
          setError(e?.message || 'Failed to complete subscription');
        }
        
        // Clean up URL and refresh
        window.history.replaceState({}, '', '/manage/subscription');
        setTimeout(() => {
          fetchSubscription();
        }, 500);
      } else {
        fetchSubscription();
      }
    };
    
    handleUpgradeReturn();
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

      // Fetch usage stats if on free tier
      if (response.tier === 'free') {
        try {
          const statsResponse = await apiClient.get('/client/usage-stats');
          console.log('[SubscriptionManager] Usage stats:', statsResponse);
          setUsageStats(statsResponse);
        } catch (statsErr: any) {
          console.error('[SubscriptionManager] Failed to fetch usage stats:', statsErr);
          // Don't fail the whole component if stats fail
        }
      }
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

  const startUpgrade = () => {
    // Calculate quantity based on current active employees or default to 1
    const quantity = usageStats?.activeEmployees || 1;
    setUpgradeQuantity(Math.max(1, quantity));
    setShowUpgrade(true);
  };

  const handleUpgradeSuccess = () => {
    setShowUpgrade(false);
    fetchSubscription();
  };

  const handleUpgradeCancel = () => {
    setShowUpgrade(false);
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
  const priceId = import.meta.env.PUBLIC_STRIPE_PRICE_ID || 'price_1QXlxnP5zXCWi9Tt8f0KNLoe';

  // Show upgrade flow if user clicked upgrade
  if (showUpgrade) {
    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Upgrade to Pro Plan</h1>
          <p className="text-muted-foreground mt-2">
            Complete your payment to unlock unlimited access
          </p>
        </div>
        <UpgradeFlow
          priceId={priceId}
          quantity={upgradeQuantity}
          onSuccess={handleUpgradeSuccess}
          onCancel={handleUpgradeCancel}
        />
      </div>
    );
  }

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
              {/* Usage Statistics */}
              {usageStats && (
                <div className="space-y-3">
                  <h3 className="font-semibold">Current Usage</h3>
                  
                  {/* Active Employees */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center">
                        <Users className="h-4 w-4 mr-2" />
                        Active Employees
                      </span>
                      <span className="font-medium">
                        {usageStats.activeEmployees} / {usageStats.limits.maxEmployees}
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          usageStats.activeEmployees >= usageStats.limits.maxEmployees 
                            ? 'bg-destructive' 
                            : 'bg-primary'
                        }`}
                        style={{ 
                          width: `${Math.min((usageStats.activeEmployees / usageStats.limits.maxEmployees) * 100, 100)}%` 
                        }}
                      />
                    </div>
                  </div>

                  {/* Emails Sent This Month */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center">
                        <CreditCard className="h-4 w-4 mr-2" />
                        Emails Sent This Month
                      </span>
                      <span className="font-medium">
                        {usageStats.emailsSentThisMonth} / {usageStats.limits.maxEmailsPerMonth}
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          usageStats.emailsSentThisMonth >= usageStats.limits.maxEmailsPerMonth 
                            ? 'bg-destructive' 
                            : 'bg-primary'
                        }`}
                        style={{ 
                          width: `${Math.min((usageStats.emailsSentThisMonth / usageStats.limits.maxEmailsPerMonth) * 100, 100)}%` 
                        }}
                      />
                    </div>
                    {usageStats.emailsSentThisMonth >= usageStats.limits.maxEmailsPerMonth && (
                      <p className="text-xs text-destructive flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        You've reached your monthly email limit
                      </p>
                    )}
                  </div>
                </div>
              )}

              <Separator />

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
                <Button 
                  onClick={startUpgrade}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
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
