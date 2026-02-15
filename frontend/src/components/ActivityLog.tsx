/**
 * Activity Log Component
 *
 * Paginated table that displays all logged agent/system actions.
 * Admin-only — the API endpoint and RLS both enforce this.
 */

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/utils/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  Search,
} from "lucide-react";

import type {
  ActivityLogEntry,
  ActivityLogPagination,
  ActivityCategory,
} from "@/types/activity-log.types";

/* ---------- Action display mapping ---------- */

const ACTION_LABELS: Record<string, string> = {
  // Email
  "email.sent": "Email Sent",
  "email.internal_note_added": "Internal Note Added",
  // Ticket
  "ticket.status_changed": "Ticket Status Changed",
  "ticket.subject_changed": "Ticket Subject Changed",
  "ticket.bulk_status_changed": "Bulk Status Changed",
  // Customer
  "customer.merged": "Customer Merged",
  // Assignment
  "assignment.employee_assigned": "Employee Assigned",
  "assignment.group_assigned": "Group Assigned",
  "assignment.unassigned": "Unassigned",
  "assignment.bulk_assigned": "Bulk Assigned",
  "assignment.bulk_unassigned": "Bulk Unassigned",
  "assignment.bulk_reassigned": "Bulk Reassigned",
  // Shopify
  "shopify.connected": "Shopify Connected",
  "shopify.disconnected": "Shopify Disconnected",
  "shopify.refund_created": "Shopify Refund Created",
  "shopify.order_cancelled": "Shopify Order Cancelled",
  // Settings
  "settings.signature_updated": "Signature Updated",
  "settings.email_config_updated": "Email Config Updated",
  "settings.confirm_mail_updated": "Confirmation Email Updated",
  "settings.tracking_updated": "Tracking Settings Updated",
  "settings.general_updated": "General Settings Updated",
  "settings.confirm_mail_mode_updated": "Confirm Mail Mode Updated",
  "settings.auto_assign_toggle": "Auto-Assign Toggled",
  // Employee
  "employee.created": "Employee Created",
  "employee.updated": "Employee Updated",
  "employee.deleted": "Employee Deleted",
  "employee.disabled": "Employee Disabled",
  "employee.enabled": "Employee Enabled",
  "employee.profile_updated": "Profile Updated",
  // Company
  "company.updated": "Company Updated",
  // Macros
  "macro.created": "Macro Created",
  "macro.updated": "Macro Updated",
  "macro.deleted": "Macro Deleted",
  "macro.group_deleted": "Macro Group Deleted",
  // Groups
  "group.created": "Group Created",
  "group.updated": "Group Updated",
  "group.deleted": "Group Deleted",
  "group.member_added": "Group Member Added",
  "group.member_removed": "Group Member Removed",
  // Inboxes
  "inbox.created": "Inbox Created",
  "inbox.updated": "Inbox Updated",
  "inbox.deleted": "Inbox Deleted",
  "inbox.group_added": "Inbox Group Added",
  "inbox.group_removed": "Inbox Group Removed",
  "inbox.filters_set": "Inbox Filters Set",
  // Email accounts
  "email_account.added": "Email Account Added",
  "email_account.updated": "Email Account Updated",
  "email_account.deleted": "Email Account Deleted",
  // Billing
  "billing.checkout_created": "Checkout Created",
  "billing.subscription_completed": "Subscription Completed",
  // Auth
  "auth.signed_in": "Signed In",
  "auth.signed_out": "Signed Out",
};

const CATEGORY_LABELS: Record<string, string> = {
  email: "Email",
  ticket: "Ticket",
  customer: "Customer",
  assignment: "Assignment",
  shopify: "Shopify",
  settings: "Settings",
  employee_mgmt: "Employees",
  macro: "Macros",
  group: "Groups",
  inbox: "Inboxes",
  email_account: "Email Accounts",
  billing: "Billing",
  auth: "Auth",
};

const CATEGORY_COLORS: Record<string, string> = {
  email: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ticket: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  customer: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  assignment: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  shopify: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  settings: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  employee_mgmt: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  macro: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  group: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  inbox: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  email_account: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  billing: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  auth: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200",
};

/* ---------- Detail renderer ---------- */

function renderDetails(details: Record<string, any> | null): string {
  if (!details || Object.keys(details).length === 0) return "—";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) continue;
    // Clean up key name for display
    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim();
    parts.push(`${label}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
  }
  return parts.join(" · ") || "—";
}

/* ---------- formatRelativeTime ---------- */

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/* ---------- Component ---------- */

interface ActivityLogProps {
  /** nothing required — data is fetched client-side */
}

export function ActivityLog(_props: ActivityLogProps) {
  const { t } = useTranslation("manage");

  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [pagination, setPagination] = useState<ActivityLogPagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchLogs = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "50");
        if (category && category !== "all") params.set("category", category);

        const data = await apiClient.get(`/activity-log?${params.toString()}`);
        if (data.success) {
          let filtered = data.data as ActivityLogEntry[];
          // Client-side text filter (action label or employee name)
          if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            filtered = filtered.filter((e) => {
              const label = (ACTION_LABELS[e.action] || e.action).toLowerCase();
              const empName = e.employees?.name?.toLowerCase() || "";
              const details = e.details ? JSON.stringify(e.details).toLowerCase() : "";
              return label.includes(q) || empName.includes(q) || details.includes(q);
            });
          }
          setEntries(filtered);
          setPagination(data.pagination);
        }
      } catch (err) {
        console.error("[ActivityLog] fetch error:", err);
      } finally {
        setLoading(false);
      }
    },
    [category, debouncedSearch]
  );

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const goToPage = (page: number) => {
    if (page < 1 || page > pagination.totalPages) return;
    fetchLogs(page);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Activity Log</h2>
        <p className="text-muted-foreground">
          A chronological record of all actions performed in your workspace.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actions, employees, details…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={category} onValueChange={(v) => setCategory(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          onClick={() => fetchLogs(pagination.page)}
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Time</TableHead>
              <TableHead className="w-[140px]">Employee</TableHead>
              <TableHead className="w-[120px]">Category</TableHead>
              <TableHead className="w-[200px]">Action</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              // Skeleton rows
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  No activity log entries found.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell
                    className="text-sm text-muted-foreground whitespace-nowrap"
                    title={new Date(entry.created_at).toLocaleString()}
                  >
                    {formatRelativeTime(entry.created_at)}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {entry.employees?.name || (
                      <span className="text-muted-foreground italic">System</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-xs font-medium ${
                        CATEGORY_COLORS[entry.category] || ""
                      }`}
                    >
                      {CATEGORY_LABELS[entry.category] || entry.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {ACTION_LABELS[entry.action] || entry.action}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[350px] truncate">
                    {renderDetails(entry.details)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total entries)
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page <= 1}
              onClick={() => goToPage(1)}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page <= 1}
              onClick={() => goToPage(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => goToPage(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => goToPage(pagination.totalPages)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
