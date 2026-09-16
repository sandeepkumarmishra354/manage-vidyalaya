import { badgeVariants } from "@/components/ui/badge";
import type { AttendanceStatus, DayType } from "@/lib/api";
import { cn } from "@/lib/utils";

// Cycle order for click-to-mark cells. There's no "clear" step -- once a day
// is marked it stays marked (matches the lack of a delete endpoint), it just
// moves to the next status in the cycle.
export const STATUS_CYCLE: AttendanceStatus[] = ["present", "absent", "late", "half_day", "leave"];

export const STATUS_CODE: Record<AttendanceStatus, string> = {
  present: "P",
  absent: "A",
  late: "T",
  half_day: "H",
  leave: "L",
};

export const STATUS_BADGE_VARIANT: Record<AttendanceStatus, "success" | "destructive" | "warning" | "info" | "secondary"> = {
  present: "success",
  absent: "destructive",
  late: "warning",
  half_day: "info",
  leave: "secondary",
};

export interface MonthAttendanceGridRow {
  id: string;
  primaryLabel: string;
  secondaryLabel?: string | null;
  days: Record<string, AttendanceStatus | undefined>;
}

function weekdayAbbrev(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
}

export function todayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Shared presentational grid for both the student and staff attendance
// calendars: sticky header row + first column, day-of-week/day-number
// stacked headers, pill-style status cells, a legend, alternating row
// shading, a today-column highlight, and calendar-day tinting (holiday
// columns disabled entirely; half-day columns tinted but still clickable).
export function MonthAttendanceGrid({
  rowLabel,
  dates,
  rows,
  dayTypes,
  holidayNames,
  canMark,
  onCycleCell,
}: {
  rowLabel: string;
  dates: string[];
  rows: MonthAttendanceGridRow[];
  dayTypes: Record<string, DayType>;
  holidayNames: Record<string, string>;
  canMark: boolean;
  onCycleCell: (rowId: string, date: string) => void;
}) {
  const todayIso = todayIsoLocal();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {STATUS_CYCLE.map((status) => (
          <span key={status} className="flex items-center gap-1">
            <span className={cn(badgeVariants({ variant: STATUS_BADGE_VARIANT[status] }), "size-4 justify-center rounded-full p-0")}>
              {STATUS_CODE[status]}
            </span>
            {status.replace("_", " ")}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-sm bg-destructive/15 ring-1 ring-inset ring-destructive/30" />
          Holiday
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-sm bg-warning/20 ring-1 ring-inset ring-warning/40" />
          School half-day
        </span>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 border-b bg-background px-3 py-2 text-left font-medium">
                {rowLabel}
              </th>
              {dates.map((date) => {
                const dayType = dayTypes[date];
                const isToday = date === todayIso;
                const holidayName = holidayNames[date];
                return (
                  <th
                    key={date}
                    title={holidayName}
                    className={cn(
                      "sticky top-0 z-20 w-11 border-b px-1 py-1.5 text-center font-normal",
                      dayType === "holiday"
                        ? "bg-destructive/10"
                        : dayType === "half_day"
                          ? "bg-warning/10"
                          : "bg-background",
                    )}
                  >
                    <div className="flex flex-col items-center leading-tight">
                      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                        {weekdayAbbrev(date)}
                      </span>
                      <span className={cn("text-sm font-semibold", isToday && "text-primary underline decoration-2 underline-offset-2")}>
                        {Number(date.slice(8, 10))}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const rowStripe = i % 2 === 1 ? "bg-muted/30" : "bg-background";
              return (
                <tr key={row.id} className={i % 2 === 1 ? "bg-muted/30" : undefined}>
                  <td className={cn("sticky left-0 z-10 border-r px-3 py-1.5 font-medium whitespace-nowrap", rowStripe)}>
                    {row.primaryLabel}
                    {row.secondaryLabel ? ` ${row.secondaryLabel}` : ""}
                  </td>
                  {dates.map((date) => {
                    const dayType = dayTypes[date];
                    const isFuture = date > todayIso;
                    const disabled = !canMark || dayType === "holiday" || isFuture;
                    const status = row.days[date];
                    const isToday = date === todayIso;
                    return (
                      <td
                        key={date}
                        className={cn(
                          "px-1 py-1 text-center",
                          dayType === "holiday" ? "bg-destructive/5" : dayType === "half_day" ? "bg-warning/5" : undefined,
                          isToday && "bg-primary/5",
                        )}
                      >
                        <button
                          type="button"
                          disabled={disabled}
                          title={isFuture ? "Can't mark attendance for a future date" : undefined}
                          onClick={() => onCycleCell(row.id, date)}
                          className={cn(
                            badgeVariants({ variant: status ? STATUS_BADGE_VARIANT[status] : "outline" }),
                            "size-7 justify-center rounded-full p-0",
                            !disabled && "cursor-pointer hover:opacity-80",
                            disabled && (dayType === "holiday" || isFuture) && "opacity-40",
                          )}
                        >
                          {status ? STATUS_CODE[status] : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={dates.length + 1} className="py-8 text-center text-muted-foreground">
                  No rows to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
