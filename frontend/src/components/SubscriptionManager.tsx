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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('manage');
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
          const completeResponse = await apiClient.post('/client/complete-subscription', {
            sessionId
          });

          if (!completeResponse.success) {
            if (import.meta.env.DEV) {
              console.error('[SubscriptionManager] Failed to complete subscription:', completeResponse.error);
            }
            setError(completeResponse.error || 'Failed to complete subscription');
          }
        } catch (e: any) {
          if (import.meta.env.DEV) {
            console.error('[SubscriptionManager] Error completing subscription:', e);
          }
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
      setData(response);

      // Fetch usage stats if on free tier
      if (response.tier === 'free') {
        try {
          const statsResponse = await apiClient.get('/client/usage-stats');
          setUsageStats(statsResponse);
        } catch (statsErr: any) {
          if (import.meta.env.DEV) {
            console.error('[SubscriptionManager] Failed to fetch usage stats:', statsErr);
          }
          // Don't fail the whole component if stats fail
        }
      }
    } catch (e: any) {
      if (import.meta.env.DEV) {
        console.error('[SubscriptionManager] Error:', e);
      }
      setError(e?.message || t('subscription.failedToLoadSubscriptionData'));
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
      alert(e?.message || t('subscription.failedToOpenBillingPortal'));
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
      active: { variant: 'default', label: t('subscription.active') },
      trialing: { variant: 'secondary', label: t('subscription.trial') },
      past_due: { variant: 'destructive', label: t('subscription.pastDue') },
      canceled: { variant: 'outline', label: t('subscription.canceled') },
      incomplete: { variant: 'outline', label: t('subscription.incomplete') },
    };

    const config = statusConfig[status] || { variant: 'outline', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">{t('subscription.loadingSubscription')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle>{t('subscription.errorLoadingSubscription')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={fetchSubscription} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('common.loading')}
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
        <div className="space-y-1 mt-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t('subscription.upgradeToPro')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('subscription.completeYourPaymentToUnlockUnlimitedAccess')}
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
      <div className="space-y-1 mt-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('pages.subscription.heading')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('subscription.subtitle')}
        </p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5" />
              <CardTitle>{t('subscription.currentPlan')}</CardTitle>
            </div>
            {!isFree && getStatusBadge(data.status)}
          </div>
          <CardDescription>
            {isFree
              ? t('subscription.youAreCurrentlyOnTheFreePlan')
              : t('subscription.youAreSubscribedToTheProPlan')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isFree ? (
            <>
              {/* Usage Statistics */}
              {usageStats && (
                <div className="space-y-3">
                  <h3 className="font-semibold">{t('subscription.currentUsage')}</h3>
                  
                  {/* Active Employees */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center">
                        <Users className="h-4 w-4 mr-2" />
                        {t('subscription.activeEmployees')}
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
                        {t('subscription.emailsSentThisMonth')}
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
                        {t('subscription.youHaveReachedYourMonthlyEmailLimit')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <h3 className="font-semibold">{t('subscription.freePlan')} {t('subscription.features')}</h3>
                <ul className="space-y-2">
                  <li className="flex items-center text-sm">
                    <Check className="h-4 w-4 mr-2 text-primary" />
                    {t('subscription.oneUserAccount')}
                  </li>
                  <li className="flex items-center text-sm">
                    <Check className="h-4 w-4 mr-2 text-primary" />
                    {t('subscription.sendUpTo50EmailsPerMonth')}
                  </li>
                  <li className="flex items-center text-sm">
                    <Check className="h-4 w-4 mr-2 text-primary" />
                    {t('subscription.basicSupport')}
                  </li>
                </ul>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  {t('subscription.upgradeToProForUnlimitedUsersAndEmails')}
                </p>
                <Button 
                  onClick={startUpgrade}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('subscription.upgradeToPro')}
                </Button>
              </div>
            </>
          ) : data.subscription ? (
            <>
              <div className="space-y-2 mb-4">
                <h3 className="font-semibold">{t('subscription.subscriptionDetails')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('subscription.yourCurrentSubscriptionStatus')}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('subscription.price')}</p>
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
                    {t('subscription.users')}
                  </p>
                  <p className="text-2xl font-bold">{data.subscription.quantity}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    {t('subscription.currentPeriod')}
                  </p>
                  <p className="text-sm">
                    {formatDate(data.subscription.currentPeriodStart)} -{' '}
                    {formatDate(data.subscription.currentPeriodEnd)}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{t('subscription.total')}</p>
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
                    {t('subscription.subscriptionWillCancelOn')}{' '}
                    {formatDate(data.subscription.currentPeriodEnd)}
                  </p>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{t('subscription.manageSubscription')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('subscription.updatePaymentMethodBillingDetailsOrCancelSubscription')}
                  </p>
                </div>
                <Button onClick={openBillingPortal} disabled={portalLoading}>
                  {portalLoading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      {t('subscription.loading')}
                    </>
                  ) : (
                    <>
                      {t('subscription.manageBilling')}
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
            <CardTitle>{t('subscription.proPlanFeatures')}</CardTitle>
            <CardDescription>{t('subscription.everythingIncludedInYourSubscription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <li className="flex items-center text-sm">
                <Check className="h-4 w-4 mr-2 text-primary shrink-0" />
                {t('subscription.unlimitedUsers')}
              </li>
              <li className="flex items-center text-sm">
                <Check className="h-4 w-4 mr-2 text-primary shrink-0" />
                {t('subscription.unlimitedEmails')}
              </li>
              <li className="flex items-center text-sm">
                <Check className="h-4 w-4 mr-2 text-primary shrink-0" />
                {t('subscription.prioritySupport')}
              </li>
              <li className="flex items-center text-sm">
                <Check className="h-4 w-4 mr-2 text-primary shrink-0" />
                {t('subscription.advancedAnalytics')}
              </li>
              <li className="flex items-center text-sm">
                <Check className="h-4 w-4 mr-2 text-primary shrink-0" />
                {t('subscription.customIntegrations')}
              </li>
              <li className="flex items-center text-sm">
                <Check className="h-4 w-4 mr-2 text-primary shrink-0" />
                {t('subscription.teamCollaboration')}
              </li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
