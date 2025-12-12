/**
 * Analytics Employee Chart Component
 * 
 * Line chart showing emails sent per employee over time
 */

"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"

interface DailyEmployeeStats {
  date: string;
  employee_id: number;
  employee_name: string;
  count: number;
}

interface AnalyticsEmployeeChartProps {
  data: DailyEmployeeStats[];
  dateRange: string;
}

// Colors for different employees
const EMPLOYEE_COLORS = [
  "#2563eb", // blue
  "#16a34a", // green
  "#dc2626", // red
  "#8b5cf6", // purple
  "#ea580c", // orange
  "#0891b2", // cyan
  "#be185d", // pink
  "#65a30d", // lime
];

export function AnalyticsEmployeeChart({ 
  data, 
  dateRange 
}: AnalyticsEmployeeChartProps) {
  // Group by date and pivot by employee
  const dateMap = new Map<string, any>();
  const employeeSet = new Set<string>();
  
  data.forEach(item => {
    const dateKey = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const employeeName = item.employee_name;
    employeeSet.add(employeeName);
    
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, { date: dateKey });
    }
    
    dateMap.get(dateKey)![employeeName] = item.count;
  });

  const chartData = Array.from(dateMap.values());
  const employees = Array.from(employeeSet);

  // Build chart config dynamically
  const chartConfig: ChartConfig = {};
  employees.forEach((emp, index) => {
    chartConfig[emp] = {
      label: emp,
      color: EMPLOYEE_COLORS[index % EMPLOYEE_COLORS.length],
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee Email Activity Over Time</CardTitle>
        <CardDescription>{dateRange}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <LineChart
            data={chartData}
            margin={{
              top: 5,
              right: 10,
              left: 10,
              bottom: 0,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            {employees.map((emp, index) => (
              <Line
                key={emp}
                dataKey={emp}
                type="monotone"
                stroke={EMPLOYEE_COLORS[index % EMPLOYEE_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
