import { useState } from "react";
import { DownloadIcon } from "lucide-react";

import { api } from "@/lib/api";
import { downloadCsv, toCsv } from "@/lib/csv";
import { PersonLink } from "@/components/person-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ReportRow {
  id: string;
  name: string;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  leave: number;
  working_days: number;
  percent_present: number;
}

function firstOfMonthIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const CSV_COLUMNS: { header: string; value: (r: ReportRow) => string | number }[] = [
  { header: "Present", value: (r) => r.present },
  { header: "Absent", value: (r) => r.absent },
  { header: "Late", value: (r) => r.late },
  { header: "Half day", value: (r) => r.half_day },
  { header: "Leave", value: (r) => r.leave },
  { header: "Working days", value: (r) => r.working_days },
  { header: "% Present", value: (r) => r.percent_present },
];

// One attendance-report view shared by both the student and staff branches
// of the unified Attendance page -- on-screen summary table with a CSV
// export, generated for a date range (per class/section for students, for
// the whole branch for staff).
export function AttendanceReportTab(
  props:
    | { personType: "student"; branchId: string; classId: string; sectionId: string | null }
    | { personType: "staff"; branchId: string },
) {
  const [startDate, setStartDate] = useState(firstOfMonthIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const canGenerate = props.personType === "staff" || !!props.classId;

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      if (props.personType === "student") {
        const data = await api.getAttendanceReport(props.branchId, props.classId, props.sectionId, startDate, endDate);
        setRows(data.map((r) => ({ id: r.student_id, name: r.student_name, ...r })));
      } else {
        const data = await api.getStaffAttendanceReport(props.branchId, startDate, endDate);
        setRows(data.map((r) => ({ id: r.staff_id, name: r.staff_name, ...r })));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!rows) return;
    const csv = toCsv(rows, [{ header: props.personType === "student" ? "Student" : "Staff", value: (r) => r.name }, ...CSV_COLUMNS]);
    const label = props.personType === "student" ? "attendance-report" : "staff-attendance-report";
    downloadCsv(`${label}-${startDate}-to-${endDate}.csv`, csv);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>From</Label>
          <Input type="date" className="w-40" max={todayIso()} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>To</Label>
          <Input type="date" className="w-40" max={todayIso()} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Button onClick={handleGenerate} disabled={isLoading || !canGenerate}>
          {isLoading ? "Generating..." : "Generate report"}
        </Button>
        {rows && rows.length > 0 && (
          <Button variant="outline" onClick={handleExport}>
            <DownloadIcon />
            Export CSV
          </Button>
        )}
      </div>

      {rows && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{props.personType === "student" ? "Student" : "Staff"}</TableHead>
                <TableHead>Present</TableHead>
                <TableHead>Absent</TableHead>
                <TableHead>Late</TableHead>
                <TableHead>Half day</TableHead>
                <TableHead>Leave</TableHead>
                <TableHead>Working days</TableHead>
                <TableHead>% Present</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <PersonLink type={props.personType} id={r.id} name={r.name} />
                  </TableCell>
                  <TableCell>{r.present}</TableCell>
                  <TableCell>{r.absent}</TableCell>
                  <TableCell>{r.late}</TableCell>
                  <TableCell>{r.half_day}</TableCell>
                  <TableCell>{r.leave}</TableCell>
                  <TableCell>{r.working_days}</TableCell>
                  <TableCell>{r.percent_present}%</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No data for this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
