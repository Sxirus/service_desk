/**
 * Analytics Employee Table Component
 * 
 * Table showing detailed breakdown of emails sent per employee.
 * Refactored to use the reusable SimpleDataTable component.
 */

"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { SimpleDataTable, type SimpleColumnDef } from "@/components/datatable/SimpleDataTable"

interface EmployeeStats {
  employee_id: number;
  employee_name: string;
  email_count: number;
}

interface AnalyticsEmployeeTableProps {
  data: EmployeeStats[];
  dateRange: string;
}

export function AnalyticsEmployeeTable({ 
  data, 
  dateRange 
}: AnalyticsEmployeeTableProps) {
  const { t } = useTranslation('dashboard');
  const totalEmails = data.reduce((sum, item) => sum + item.email_count, 0)

  const columns: SimpleColumnDef<EmployeeStats>[] = useMemo(() => [
    {
      id: 'rank',
      header: t('charts.rank'),
      headerClassName: 'w-[50px]',
      cell: (_, index) => <span className="font-medium">#{index + 1}</span>,
    },
    {
      id: 'employee_name',
      header: t('charts.employeeName'),
      cell: (row) => row.employee_name,
    },
    {
      id: 'email_count',
      header: t('charts.emailsSentColumn'),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      cell: (row) => row.email_count,
    },
    {
      id: 'percentage',
      header: t('charts.percentage'),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      cell: (row) => {
        const percentage = totalEmails > 0 
          ? ((row.email_count / totalEmails) * 100).toFixed(1) 
          : '0.0';
        return `${percentage}%`;
      },
    },
  ], [t, totalEmails]);

  return (
    <SimpleDataTable
      data={data}
      columns={columns}
      getRowKey={(row) => row.employee_id}
      cardConfig={{
        title: t('charts.employeePerformance'),
        description: `${dateRange} • ${t('charts.totalEmailsSent', { count: totalEmails })}`,
      }}
      emptyMessage={t('analytics.noDataForPeriod')}
    />
  )
}
