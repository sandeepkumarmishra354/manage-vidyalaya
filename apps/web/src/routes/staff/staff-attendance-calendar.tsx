import { useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { MonthAttendanceGrid, STATUS_CYCLE, type MonthAttendanceGridRow } from "@/components/month-attendance-grid";
import { Button } from "@/components/ui/button";
import { api, type AttendanceStatus, type DayType, type StaffAttendanceRosterRangeEntry } from "@/lib/api";

type DaysMap = Record<string, Record<string, AttendanceStatus | undefined>>;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function cloneDaysMap(entries: StaffAttendanceRosterRangeEntry[]): DaysMap {
  const map: DaysMap = {};
  for (const entry of entries) {
    map[entry.staff_id] = {};
    for (const [date, day] of Object.entries(entry.days)) {
      map[entry.staff_id][date] = day.status as AttendanceStatus;
    }
  }
  return map;
}

export function StaffAttendanceCalendar({ branchId, canMark }: { branchId: string; canMark: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [roster, setRoster] = useState<StaffAttendanceRosterRangeEntry[]>([]);
  const [original, setOriginal] = useState<DaysMap>({});
  const [current, setCurrent] = useState<DaysMap>({});
  const [dayTypes, setDayTypes] = useState<Record<string, DayType>>({});
  const [holidayNames, setHolidayNames] = useState<Record<string, string>>({});
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
    api.getStaffAttendanceRosterRange(branchId, startDate, endDate).then((entries) => {
      setRoster(entries);
      const days = cloneDaysMap(entries);
      setOriginal(days);
      setCurrent(structuredClone(days));
    });
    api.getDayTypes(branchId, startDate, endDate).then(setDayTypes);
  }, [branchId, year, month, daysInMonth]);

  // Best-effort holiday-name tooltips against the "current" session, same
  // caveat as the student calendar: day-type tinting is always correct
  // (session-independent), only the name lookup can miss a different session.
  useEffect(() => {
    api.listAcademicSessions().then((sessions) => {
      const currentSession = sessions.find((s) => s.is_current);
      if (!currentSession) return;
      api.getSchoolCalendar(branchId, currentSession.id).then((cal) => {
        const names: Record<string, string> = {};
        for (const h of cal.holidays) names[h.date.slice(0, 10)] = h.name;
        setHolidayNames(names);
      });
    });
  }, [branchId]);

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

  const cycleCell = (staffId: string, date: string) => {
    if (!canMark || dayTypes[date] === "holiday") return;
    setCurrent((prev) => {
      const staffDays = { ...(prev[staffId] ?? {}) };
      const existing = staffDays[date];
      const nextIndex = existing ? (STATUS_CYCLE.indexOf(existing) + 1) % STATUS_CYCLE.length : 0;
      staffDays[date] = STATUS_CYCLE[nextIndex];
      return { ...prev, [staffId]: staffDays };
    });
  };

  const hasChanges = useMemo(() => {
    for (const staffId of Object.keys(current)) {
      for (const date of dates) {
        if (current[staffId]?.[date] !== original[staffId]?.[date]) return true;
      }
    }
    return false;
  }, [current, original, dates]);

  const handleSave = async () => {
    setIsSaving(true);
    setSavedMessage(null);
    try {
      const entries: { staff_id: string; attendance_date: string; status: AttendanceStatus }[] = [];
      for (const staffId of Object.keys(current)) {
        for (const date of dates) {
          const status = current[staffId]?.[date];
          if (status && status !== original[staffId]?.[date]) {
            entries.push({ staff_id: staffId, attendance_date: date, status });
          }
        }
      }
      if (entries.length === 0) {
        setSavedMessage("No changes to save.");
        return;
      }
      await api.markStaffAttendanceBulk({ branch_id: branchId, entries });
      setOriginal(structuredClone(current));
      setSavedMessage(`Saved ${entries.length} attendance entr${entries.length === 1 ? "y" : "ies"}.`);
    } finally {
      setIsSaving(false);
    }
  };

  const rows: MonthAttendanceGridRow[] = roster.map((entry) => ({
    id: entry.staff_id,
    primaryLabel: entry.first_name,
    secondaryLabel: entry.last_name,
    days: current[entry.staff_id] ?? {},
  }));

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
