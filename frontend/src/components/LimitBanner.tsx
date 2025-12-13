"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Users, Mail, ArrowUpRight, Sparkles } from 'lucide-react';
import { apiClient } from '@/utils/api';

interface UsageStats {
  activeEmployees: number;
  emailsSentThisMonth: number;
  limits: {
    maxEmployees: number;
    maxEmailsPerMonth: number;
  };
}

interface LimitBannerProps {
  tier?: string;
}

export default function LimitBanner({ tier }: LimitBannerProps) {
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only fetch if on free tier
    if (tier === 'free' || !tier) {
      fetchUsageStats();
    } else {
      setLoading(false);
    }
  }, [tier]);

  const fetchUsageStats = async () => {
    try {
      const response = await apiClient.get('/client/usage-stats');
      setUsageStats(response);
    } catch (error) {
      console.error('[LimitBanner] Failed to fetch usage stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !usageStats || tier !== 'free') {
    return null;
  }

  const emailLimitReached = usageStats.emailsSentThisMonth >= usageStats.limits.maxEmailsPerMonth;
  const userLimitReached = usageStats.activeEmployees > usageStats.limits.maxEmployees;
  const anyLimitReached = emailLimitReached || userLimitReached;

  if (!anyLimitReached) {
    return null;
  }

  const emailPercentage = Math.min((usageStats.emailsSentThisMonth / usageStats.limits.maxEmailsPerMonth) * 100, 100);
  const userPercentage = Math.min((usageStats.activeEmployees / usageStats.limits.maxEmployees) * 100, 100);

  return (
    <Card className="mb-6 border-red-200 bg-gradient-to-r from-red-50 to-orange-50">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Free Plan Limits Reached</h3>
                <p className="text-sm text-gray-600">Upgrade to Pro to unlock unlimited access</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Email Usage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">Monthly Emails</span>
                  </div>
                  {emailLimitReached && (
                    <Badge variant="destructive" className="text-xs">Limit Reached</Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <Progress 
                    value={emailPercentage} 
                    className={emailLimitReached ? "[&>div]:bg-red-500" : ""}
                  />
                  <p className="text-xs text-gray-600">
                    {usageStats.emailsSentThisMonth} / {usageStats.limits.maxEmailsPerMonth} emails used
                  </p>
                </div>
              </div>

              {/* User Usage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">Active Users</span>
                  </div>
                  {userLimitReached && (
                    <Badge variant="destructive" className="text-xs">Limit Exceeded</Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <Progress 
                    value={userPercentage} 
                    className={userLimitReached ? "[&>div]:bg-red-500" : ""}
                  />
                  <p className="text-xs text-gray-600">
                    {usageStats.activeEmployees} / {usageStats.limits.maxEmployees} users active
                  </p>
                </div>
              </div>
            </div>

            {(emailLimitReached || userLimitReached) && (
              <div className="rounded-lg bg-red-100 px-3 py-2.5 border border-red-200">
                <p className="text-sm font-medium text-red-800">
                  🚫 Email sending is currently disabled. 
                  {userLimitReached && ' Please disable extra users or'}
                  {emailLimitReached && userLimitReached ? ' and' : ''}
                  {emailLimitReached && ' wait until next month or'} upgrade to continue.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button 
              onClick={() => window.location.href = '/manage/subscription'}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Upgrade to Pro
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-xs text-center text-gray-600">€9.99/user/month</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
