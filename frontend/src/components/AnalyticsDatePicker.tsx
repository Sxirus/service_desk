/**
 * Analytics Date Range Picker Component
 * 
 * Based on Calendar05, customized for analytics date range selection
 */

"use client"

import * as React from "react"
import { type DateRange } from "react-day-picker"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { format, subDays } from "date-fns"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"

interface AnalyticsDatePickerProps {
  onDateRangeChange: (range: DateRange | undefined) => void;
  initialFrom?: Date;
  initialTo?: Date;
}

export function AnalyticsDatePicker({ 
  onDateRangeChange, 
  initialFrom, 
  initialTo 
}: AnalyticsDatePickerProps) {
  const { t } = useTranslation('dashboard');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: initialFrom || subDays(new Date(), 30),
    to: initialTo || new Date(),
  })
  const [tempDateRange, setTempDateRange] = React.useState<DateRange | undefined>(undefined)
  const [open, setOpen] = React.useState(false)

  const handleSelect = (range: DateRange | undefined) => {
    setTempDateRange(range)
  }

  const handleConfirm = () => {
    if (tempDateRange?.from && tempDateRange?.to) {
      setDateRange(tempDateRange)
      onDateRangeChange(tempDateRange)
      setOpen(false)
      setTempDateRange(undefined)
    }
  }

  const handlePreset = (days: number) => {
    const to = new Date()
    const from = subDays(to, days)
    const newRange = { from, to }
    setDateRange(newRange)
    onDateRangeChange(newRange)
    setOpen(false)
  }

  return (
    <div className="flex gap-2 items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[280px] justify-start text-left font-normal",
              !dateRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "LLL dd, y")} -{" "}
                  {format(dateRange.to, "LLL dd, y")}
                </>
              ) : (
                format(dateRange.from, "LLL dd, y")
              )
            ) : (
              <span>{t('datePicker.pickRange')}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            {/* Presets Column */}
            <div className="border-r p-3 space-y-2">
                <div className="text-sm font-semibold mb-2">{t('datePicker.quickSelect')}</div>
                <div className="flex flex-col space-y-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className=" justify-start font-normal"
                        onClick={() => handlePreset(7)}
                    >
                        {t('datePicker.last7Days')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className=" justify-start font-normal"
                        onClick={() => handlePreset(14)}
                    >
                        {t('datePicker.last14Days')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className=" justify-start font-normal"
                        onClick={() => handlePreset(30)}
                    >
                        {t('datePicker.last30Days')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className=" justify-start font-normal"
                        onClick={() => handlePreset(60)}
                    >
                        {t('datePicker.last60Days')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start font-normal"
                        onClick={() => handlePreset(90)}
                    >
                        {t('datePicker.last90Days')}
                    </Button>
                </div>
            </div>
            
            {/* Calendar */}
            <div className="flex flex-col">
              <Calendar
                mode="range"
                defaultMonth={dateRange?.from}
                selected={tempDateRange || dateRange}
                onSelect={handleSelect}
                numberOfMonths={2}
                className="rounded-lg"
              />
              <div className="border-t p-3 flex justify-end">
                <Button
                  onClick={handleConfirm}
                  disabled={!tempDateRange?.from || !tempDateRange?.to}
                  size="sm"
                >
                  {t('datePicker.apply')}
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
