/**
 * Analytics Email Chart Component
 * 
 * Based on ChartLineDefault, customized for email analytics data
 */

"use client"

import { TrendingUp, TrendingDown } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { useTranslation } from "react-i18next"
import { formatDate } from "@/i18n/utils"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"

interface EmailChartData {
  date: string;
  incoming: number;
  sent: number;
}

interface AnalyticsEmailChartProps {
  data: EmailChartData[];
  dateRange: string;
  totalIncoming: number;
  totalSent: number;
}

const chartConfig = {
  incoming: {
    label: "Received",
    color: "#2563eb",
  },
  sent: {
    label: "Sent",
    color: "#16a34a",
  },
} satisfies ChartConfig

export function AnalyticsEmailChart({ 
  data, 
  dateRange, 
  totalIncoming, 
  totalSent 
}: AnalyticsEmailChartProps) {
  const { t } = useTranslation('dashboard');
  
  // Format data for the chart
  const chartData = data.map(item => ({
    date: formatDate(new Date(item.date), { month: 'short', day: 'numeric' }),
    incoming: Number(item.incoming) || 0,
    sent: Number(item.sent) || 0,
  }))

  console.log('[Chart] Data:', chartData)
  console.log('[Chart] Config:', chartConfig)

  // Calculate trend
  const firstHalf = data.slice(0, Math.floor(data.length / 2))
  const secondHalf = data.slice(Math.floor(data.length / 2))
  
  const firstHalfAvg = firstHalf.reduce((sum, item) => sum + item.incoming + item.sent, 0) / firstHalf.length
  const secondHalfAvg = secondHalf.reduce((sum, item) => sum + item.incoming + item.sent, 0) / secondHalf.length
  
  const percentChange = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100).toFixed(1)
  const isPositiveTrend = parseFloat(percentChange) > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('charts.emailVolumeOverTime')}</CardTitle>
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
            <Line
              dataKey="incoming"
              type="monotone"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="sent"
              type="monotone"
              stroke="#16a34a"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          {isPositiveTrend ? (
            <>
              {t('charts.trendingUp', { percent: Math.abs(parseFloat(percentChange)) })}
              <TrendingUp className="h-4 w-4" />
            </>
          ) : (
            <>
              {t('charts.trendingDown', { percent: Math.abs(parseFloat(percentChange)) })}
              <TrendingDown className="h-4 w-4" />
            </>
          )}
        </div>
        <div className="text-muted-foreground leading-none">
          {t('charts.totalEmailsSummary', { received: totalIncoming, sent: totalSent })}
        </div>
      </CardFooter>
    </Card>
  )
}
