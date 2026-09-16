import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { MonthAttendanceGrid } from "@/components/month-attendance-grid";
import { Button } from "@/components/ui/button";
import { monthLabel, useMonthAttendance } from "@/hooks/use-month-attendance";

export function StaffAttendanceCalendar({ branchId, canMark }: { branchId: string; canMark: boolean }) {
  const {
    year,
    month,
    dates,
    roster,
    rows,
    dayTypes,
    holidayNames,
    isSaving,
    savedMessage,
    hasChanges,
    goToPreviousMonth,
    goToNextMonth,
    cycleCell,
    handleSave,
  } = useMonthAttendance({ personType: "staff", branchId, canMark });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="min-w-40 text-center text-sm font-medium">{monthLabel(year, month)}</span>
        <Button variant="outline" size="icon" onClick={goToNextMonth}>
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      <MonthAttendanceGrid
        rowLabel="Staff"
        dates={dates}
        rows={rows}
        dayTypes={dayTypes}
        holidayNames={holidayNames}
        canMark={canMark}
        onCycleCell={cycleCell}
      />

      {canMark && roster.length > 0 && (
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
            {isSaving ? "Saving..." : "Save month"}
          </Button>
          {savedMessage && <p className="text-sm text-muted-foreground">{savedMessage}</p>}
        </div>
      )}
    </div>
  );
}
