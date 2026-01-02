/**
 * Skeleton loading components for the User Management page
 * Provides consistent loading states for users table and groups panel
 */

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for a single user row in the table
 */
function UserRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 px-4">
      {/* Avatar */}
      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
      
      {/* Name and email */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-44" />
      </div>
      
      {/* Role */}
      <div className="hidden sm:flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-20" />
      </div>
      
      {/* Actions */}
      <Skeleton className="h-8 w-8 rounded" />
    </div>
  );
}

/**
 * Skeleton for the users table
 */
export function UsersTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Table header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/30">
        <Skeleton className="h-4 w-16" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-12 hidden sm:block" />
        <Skeleton className="h-4 w-8" />
      </div>
      
      {/* Table rows */}
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <UserRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for a single group item
 */
function GroupItemSkeleton() {
  return (
    <div className="p-3 rounded-lg border border-transparent">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="flex gap-1 shrink-0">
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for the groups panel
 */
export function GroupsPanelSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Groups List */}
        <div className="rounded-xl border bg-card">
          <div className="px-4 py-3 border-b">
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="p-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <GroupItemSkeleton key={i} />
            ))}
          </div>
        </div>

        {/* Group Details */}
        <div className="rounded-xl border bg-card">
          <div className="px-4 py-3 border-b">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="p-4 space-y-4">
            <Skeleton className="h-3 w-full" />
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="space-y-1">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-6 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for the stats cards
 */
export function StatsCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-6 w-8" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Full page skeleton for the user management page
 */
export function UserManagementSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>

      {/* Stats */}
      <StatsCardsSkeleton />

      {/* Users Table Section */}
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <UsersTableSkeleton rows={5} />
      </div>

      {/* Groups Section */}
      <div className="space-y-4">
        <div>
          <Skeleton className="h-5 w-16 mb-1" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="rounded-xl border bg-card shadow-sm p-6">
          <GroupsPanelSkeleton />
        </div>
      </div>
    </div>
  );
}
