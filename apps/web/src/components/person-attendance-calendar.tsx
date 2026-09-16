import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { MonthAttendanceGrid } from "@/components/month-attendance-grid";
import { Button } from "@/components/ui/button";
import { monthLabel, useMonthAttendance } from "@/hooks/use-month-attendance";

// Read-only, single-row rendering of the shared month attendance grid for
// one student/staff member's profile page. Marking attendance stays on the
// unified /attendance page -- this just reuses the same roster-range fetch
// and filters down to the one row that matches personId, rather than
// re-deriving a date display from history records (which is also how the
// old text-badge list picked up a raw-ISO-timestamp display bug).
export function PersonAttendanceCalendar(
  props:
    | { personType: "student"; branchId: string; personId: string; classId: string; sectionId?: string | null }
    | { personType: "staff"; branchId: string; personId: string },
) {
  const { personType, branchId, personId } = props;
  const classId = personType === "student" ? props.classId : undefined;
  const sectionId = personType === "student" ? props.sectionId : undefined;

  const { year, month, dates, rows, dayTypes, holidayNames, goToPreviousMonth, goToNextMonth } = useMonthAttendance({
    personType,
    branchId,
    classId,
    sectionId,
    canMark: false,
  });

  const personRow = rows.filter((r) => r.id === personId);

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
        rowLabel={personType === "student" ? "Student" : "Staff"}
        dates={dates}
        rows={personRow}
        dayTypes={dayTypes}
        holidayNames={holidayNames}
        canMark={false}
        onCycleCell={() => {}}
      />
    </div>
  );
}
