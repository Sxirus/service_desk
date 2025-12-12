/**
 * Analytics Dashboard Client Component
 * 
 * Handles client-side interactivity:
 * - Date range selection
 * - Data refetching
 * - Chart and stats updates
 */

"use client"

import React, { useState } from 'react';
import { type DateRange } from "react-day-picker"
import { AnalyticsDatePicker } from './AnalyticsDatePicker';
import { AnalyticsEmailChart } from './AnalyticsEmailChart';
import { AnalyticsEmployeeChart } from './AnalyticsEmployeeChart';
import { AnalyticsEmployeeTable } from './AnalyticsEmployeeTable';
import { apiClient } from '@/utils/api';

interface DailyStats {
  date: string;
  incoming: number;
  sent: number;
}

interface AnalyticsStats {
  totalIncoming: number;
  totalSent: number;
  averageIncomingPerDay: number;
  averageResponseTime: number;
  dailyStats: DailyStats[];
}

interface EmployeeStats {
  employee_id: number;
  employee_name: string;
  email_count: number;
}

interface DailyEmployeeStats {
  date: string;
  employee_id: number;
  employee_name: string;
  count: number;
}

interface AnalyticsDashboardProps {
  initialStats: AnalyticsStats;
  initialEmployeeStats: EmployeeStats[];
  initialEmployeeDaily: DailyEmployeeStats[];
  initialFrom: Date;
  initialTo: Date;
}

export function AnalyticsDashboard({ 
  initialStats, 
  initialEmployeeStats,
  initialEmployeeDaily,
  initialFrom, 
  initialTo 
}: AnalyticsDashboardProps) {
  const [stats, setStats] = useState<AnalyticsStats>(initialStats);
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats[]>(initialEmployeeStats);
  const [employeeDaily, setEmployeeDaily] = useState<DailyEmployeeStats[]>(initialEmployeeDaily);
  const [isLoading, setIsLoading] = useState(false);
  const [dateRange, setDateRange] = useState({ from: initialFrom, to: initialTo });

  const handleDateRangeChange = async (range: DateRange | undefined) => {
    if (!range?.from || !range?.to) return;

    setIsLoading(true);
    setDateRange({ from: range.from, to: range.to });

    try {
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();

      // Fetch new data from API in parallel
      const [emailData, employeeData] = await Promise.all([
        apiClient.get(
          `/analytics/email-stats?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`
        ),
        apiClient.get(
          `/analytics/employee-stats?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`
        )
      ]);

      setStats(emailData);
      setEmployeeStats(employeeData.summary);
      setEmployeeDaily(employeeData.daily);
    } catch (error) {
      console.error('[Analytics] Failed to fetch data:', error);
      alert('Failed to load analytics data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const dayCount = Math.ceil(
    (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)
  );

  const formatDateRange = () => {
    return `${dateRange.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${dateRange.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Page Header with Date Picker */}
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Email statistics for the selected period
          </p>
        </div>
        <AnalyticsDatePicker
          onDateRangeChange={handleDateRangeChange}
          initialFrom={dateRange.from}
          initialTo={dateRange.to}
        />
      </header>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            <span className="text-lg font-medium">Loading analytics...</span>
          </div>
        </div>
      )}

      {/* Stats Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Received */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">
              Total Received
            </h3>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              className="h-4 w-4 text-muted-foreground"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{stats.totalIncoming.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Emails received from customers
            </p>
          </div>
        </div>

        {/* Total Sent */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">
              Total Sent
            </h3>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              className="h-4 w-4 text-muted-foreground"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{stats.totalSent.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Replies sent to customers
            </p>
          </div>
        </div>

        {/* Average Incoming Per Day */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">
              Avg. Received/Day
            </h3>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              className="h-4 w-4 text-muted-foreground"
            >
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <path d="M2 10h20" />
            </svg>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{stats.averageIncomingPerDay}</div>
            <p className="text-xs text-muted-foreground">
              Daily average over {dayCount} days
            </p>
          </div>
        </div>

        {/* Average Response Time */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">
              Avg. Response Time
            </h3>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              className="h-4 w-4 text-muted-foreground"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">{stats.averageResponseTime}h</div>
            <p className="text-xs text-muted-foreground">
              Time to first response
            </p>
          </div>
        </div>
      </div>

      {/* Email Chart */}
      <AnalyticsEmailChart
        data={stats.dailyStats}
        dateRange={formatDateRange()}
        totalIncoming={stats.totalIncoming}
        totalSent={stats.totalSent}
      />

      {/* Employee Stats Section */}
      <div className="grid gap-6 md:grid-cols-2">
        <AnalyticsEmployeeChart
          data={employeeDaily}
          dateRange={formatDateRange()}
        />
        <AnalyticsEmployeeTable
          data={employeeStats}
          dateRange={formatDateRange()}
        />
      </div>

      {/* Future Features Placeholder */}
      <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
        <p className="text-sm">
          More analytics features coming soon: Response time metrics, customer satisfaction, and more.
        </p>
      </div>
    </div>
  );
}
