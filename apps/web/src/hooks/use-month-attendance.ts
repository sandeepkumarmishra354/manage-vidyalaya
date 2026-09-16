import { useEffect, useMemo, useState } from "react";

import { STATUS_CYCLE, todayIsoLocal, type MonthAttendanceGridRow } from "@/components/month-attendance-grid";
import { api, type AttendanceStatus, type DayType } from "@/lib/api";

// Shared month-navigation/mark/save logic for the student and staff
// attendance calendars -- previously duplicated near-identically between
// attendance-calendar.tsx and staff-attendance-calendar.tsx, which only
// ever differed in which api.ts roster/mark endpoints to call and the
// entity id field name (student_id vs staff_id).
export interface MonthAttendanceRosterEntry {
  id: string;
  first_name: string;
  last_name?: string | null;
  days: Record<string, { status: string | null }>;
}

type DaysMap = Record<string, Record<string, AttendanceStatus | undefined>>;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function cloneDaysMap(entries: MonthAttendanceRosterEntry[]): DaysMap {
  const map: DaysMap = {};
  for (const entry of entries) {
    map[entry.id] = {};
    for (const [date, day] of Object.entries(entry.days)) {
      map[entry.id][date] = (day.status as AttendanceStatus | null) ?? undefined;
    }
  }
  return map;
}

export function useMonthAttendance({
  personType,
  branchId,
  classId,
  sectionId,
  canMark,
}: {
  personType: "student" | "staff";
  branchId: string;
  /** Required (and only used) when personType is "student". */
  classId?: string;
  sectionId?: string | null;
  canMark: boolean;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [roster, setRoster] = useState<MonthAttendanceRosterEntry[]>([]);
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
    const rosterPromise: Promise<MonthAttendanceRosterEntry[]> =
      personType === "student"
        ? api
            .getAttendanceRosterRange(branchId, classId!, sectionId ?? null, startDate, endDate)
            .then((entries) =>
              entries.map((e) => ({ id: e.student_id, first_name: e.first_name, last_name: e.last_name, days: e.days })),
            )
        : api
            .getStaffAttendanceRosterRange(branchId, startDate, endDate)
            .then((entries) =>
              entries.map((e) => ({ id: e.staff_id, first_name: e.first_name, last_name: e.last_name, days: e.days })),
            );
    rosterPromise.then((entries) => {
      setRoster(entries);
      const days = cloneDaysMap(entries);
      setOriginal(days);
      setCurrent(structuredClone(days));
    });
    api.getDayTypes(branchId, startDate, endDate).then(setDayTypes);
  }, [personType, branchId, classId, sectionId, year, month, daysInMonth]);

  // Named holidays for the visible month, for the header tooltip -- best
  // effort against whichever session is currently marked "current"; if the
  // visible month belongs to a different session the day-type tinting above
  // still resolves correctly, only the name tooltip is missing.
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

  const cycleCell = (id: string, date: string) => {
    if (!canMark || dayTypes[date] === "holiday" || date > todayIsoLocal()) return;
    setCurrent((prev) => {
      const days = { ...(prev[id] ?? {}) };
      const existing = days[date];
      const nextIndex = existing ? (STATUS_CYCLE.indexOf(existing) + 1) % STATUS_CYCLE.length : 0;
      days[date] = STATUS_CYCLE[nextIndex];
      return { ...prev, [id]: days };
    });
  };

  const hasChanges = useMemo(() => {
    for (const id of Object.keys(current)) {
      for (const date of dates) {
        if (current[id]?.[date] !== original[id]?.[date]) return true;
      }
    }
    return false;
  }, [current, original, dates]);

  const handleSave = async () => {
    setIsSaving(true);
    setSavedMessage(null);
    try {
      const entries: { id: string; attendance_date: string; status: AttendanceStatus }[] = [];
      for (const id of Object.keys(current)) {
        for (const date of dates) {
          const status = current[id]?.[date];
          if (status && status !== original[id]?.[date]) {
            entries.push({ id, attendance_date: date, status });
          }
        }
      }
      if (entries.length === 0) {
        setSavedMessage("No changes to save.");
        return;
      }
      if (personType === "student") {
        await api.markAttendanceBulk({
          branch_id: branchId,
          class_id: classId!,
          section_id: sectionId ?? null,
          entries: entries.map((e) => ({ student_id: e.id, attendance_date: e.attendance_date, status: e.status })),
        });
      } else {
        await api.markStaffAttendanceBulk({
          branch_id: branchId,
          entries: entries.map((e) => ({ staff_id: e.id, attendance_date: e.attendance_date, status: e.status })),
        });
      }
      setOriginal(structuredClone(current));
      setSavedMessage(`Saved ${entries.length} attendance entr${entries.length === 1 ? "y" : "ies"}.`);
    } finally {
      setIsSaving(false);
    }
  };

  const rows: MonthAttendanceGridRow[] = roster.map((entry) => ({
    id: entry.id,
    primaryLabel: entry.first_name,
    secondaryLabel: entry.last_name,
    days: current[entry.id] ?? {},
  }));

  return {
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
  };
}
