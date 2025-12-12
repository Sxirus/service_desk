/**
 * Analytics Employee Table Component
 * 
 * Table showing detailed breakdown of emails sent per employee
 */

"use client"

import {
  Card,
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
  const totalEmails = data.reduce((sum, item) => sum + item.email_count, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee Performance Details</CardTitle>
        <CardDescription>
          {dateRange} • Total: {totalEmails} emails sent
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Rank</TableHead>
              <TableHead>Employee Name</TableHead>
              <TableHead className="text-right">Emails Sent</TableHead>
              <TableHead className="text-right">Percentage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No data available for the selected period
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
