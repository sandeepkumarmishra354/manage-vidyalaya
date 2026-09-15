import { useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { api, type AttendanceRosterRangeEntry, type AttendanceStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Cycle order for click-to-mark cells. There's no "clear" step -- once a day
// is marked it stays marked (matches the lack of a delete endpoint), it just
// moves to the next status in the cycle.
const STATUS_CYCLE: AttendanceStatus[] = ["present", "absent", "late", "half_day", "leave"];

const STATUS_CODE: Record<AttendanceStatus, string> = {
  present: "P",
  absent: "A",
  late: "T",
  half_day: "H",
  leave: "L",
};

const STATUS_BADGE_VARIANT: Record<AttendanceStatus, "success" | "destructive" | "warning" | "info" | "secondary"> = {
  present: "success",
  absent: "destructive",
  late: "warning",
  half_day: "info",
  leave: "secondary",
};

type DaysMap = Record<string, Record<string, AttendanceStatus | undefined>>;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function cloneDaysMap(entries: AttendanceRosterRangeEntry[]): DaysMap {
  const map: DaysMap = {};
  for (const entry of entries) {
    map[entry.student_id] = {};
    for (const [date, day] of Object.entries(entry.days)) {
      map[entry.student_id][date] = day.status as AttendanceStatus;
    }
  }
  return map;
}

export function AttendanceCalendar({
  branchId,
  classId,
  sectionId,
  canMark,
}: {
  branchId: string;
  classId: string;
  sectionId: string | null;
  canMark: boolean;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [roster, setRoster] = useState<AttendanceRosterRangeEntry[]>([]);
  const [original, setOriginal] = useState<DaysMap>({});
  const [current, setCurrent] = useState<DaysMap>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const dates = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad2(month)}-${pad2(i + 1)}`),
    [year, month, daysInMonth],
  );

  useEffect(() => {
    setSavedMessage(null);
    const startDate = `${year}-${pad2(month)}-01`;
    const endDate = `${year}-${pad2(month)}-${pad2(daysInMonth)}`;
    api.getAttendanceRosterRange(branchId, classId, sectionId, startDate, endDate).then((entries) => {
      setRoster(entries);
      const days = cloneDaysMap(entries);
      setOriginal(days);
      setCurrent(structuredClone(days));
    });
  }, [branchId, classId, sectionId, year, month, daysInMonth]);

  const goToPreviousMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const cycleCell = (studentId: string, date: string) => {
    if (!canMark) return;
    setCurrent((prev) => {
      const studentDays = { ...(prev[studentId] ?? {}) };
      const existing = studentDays[date];
      const nextIndex = existing ? (STATUS_CYCLE.indexOf(existing) + 1) % STATUS_CYCLE.length : 0;
      studentDays[date] = STATUS_CYCLE[nextIndex];
      return { ...prev, [studentId]: studentDays };
    });
  };

  const hasChanges = useMemo(() => {
    for (const studentId of Object.keys(current)) {
      for (const date of dates) {
        if (current[studentId]?.[date] !== original[studentId]?.[date]) return true;
      }
    }
    return false;
  }, [current, original, dates]);

  const handleSave = async () => {
    setIsSaving(true);
    setSavedMessage(null);
    try {
      const entries: { student_id: string; attendance_date: string; status: AttendanceStatus }[] = [];
      for (const studentId of Object.keys(current)) {
        for (const date of dates) {
          const status = current[studentId]?.[date];
          if (status && status !== original[studentId]?.[date]) {
            entries.push({ student_id: studentId, attendance_date: date, status });
          }
        }
      }
      if (entries.length === 0) {
        setSavedMessage("No changes to save.");
        return;
      }
      await api.markAttendanceBulk({
        branch_id: branchId,
        class_id: classId,
        section_id: sectionId,
        entries,
      });
      setOriginal(structuredClone(current));
      setSavedMessage(`Saved ${entries.length} attendance entr${entries.length === 1 ? "y" : "ies"}.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">{monthLabel(year, month)}</span>
          <Button variant="outline" size="icon" onClick={goToNextMonth}>
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {STATUS_CYCLE.map((status) => (
            <span key={status} className="flex items-center gap-1">
              <span className={cn(badgeVariants({ variant: STATUS_BADGE_VARIANT[status] }), "size-4 justify-center p-0")}>
                {STATUS_CODE[status]}
              </span>
              {status.replace("_", " ")}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-background">Student</TableHead>
              {dates.map((date) => (
                <TableHead key={date} className="w-8 px-1 text-center">
                  {Number(date.slice(8, 10))}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {roster.map((entry) => (
              <TableRow key={entry.student_id}>
                <TableCell className="sticky left-0 z-10 bg-background font-medium whitespace-nowrap">
                  {entry.first_name} {entry.last_name ?? ""}
                </TableCell>
                {dates.map((date) => {
                  const status = current[entry.student_id]?.[date];
                  return (
                    <TableCell key={date} className="px-1 py-1 text-center">
                      <button
                        type="button"
                        disabled={!canMark}
                        onClick={() => cycleCell(entry.student_id, date)}
                        className={cn(
                          badgeVariants({ variant: status ? STATUS_BADGE_VARIANT[status] : "outline" }),
                          "size-7 justify-center p-0",
                          canMark && "cursor-pointer",
                        )}
                      >
                        {status ? STATUS_CODE[status] : ""}
                      </button>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {roster.length === 0 && (
              <TableRow>
                <TableCell colSpan={dates.length + 1} className="py-8 text-center text-muted-foreground">
                  No students in this class/section.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
