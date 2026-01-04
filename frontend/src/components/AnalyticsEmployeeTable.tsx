/**
 * Analytics Employee Table Component
 * 
 * Table showing detailed breakdown of emails sent per employee
 */

"use client"

import { useTranslation } from "react-i18next"
import {Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('charts.employeePerformance')}</CardTitle>
        <CardDescription>
          {dateRange} • {t('charts.totalEmailsSent', { count: totalEmails })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">{t('charts.rank')}</TableHead>
              <TableHead>{t('charts.employeeName')}</TableHead>
              <TableHead className="text-right">{t('charts.emailsSentColumn')}</TableHead>
              <TableHead className="text-right">{t('charts.percentage')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {t('analytics.noDataForPeriod')}
                </TableCell>
              </TableRow>
            ) : (
              data.map((employee, index) => {
                const percentage = totalEmails > 0 
                  ? ((employee.email_count / totalEmails) * 100).toFixed(1) 
                  : '0.0';
                
                return (
                  <TableRow key={employee.employee_id}>
                    <TableCell className="font-medium">#{index + 1}</TableCell>
                    <TableCell>{employee.employee_name}</TableCell>
                    <TableCell className="text-right">{employee.email_count}</TableCell>
                    <TableCell className="text-right">{percentage}%</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
