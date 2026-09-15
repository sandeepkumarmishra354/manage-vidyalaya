import { useEffect, useState } from "react";
import { PrinterIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  type AttendanceRosterEntry,
  type AttendanceStatus,
  type SchoolClass,
  type Section,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "half_day", label: "Half Day" },
  { value: "leave", label: "Leave" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function AttendancePage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const branches = useAppStore((s) => s.branches);
  const branch = branches.find((b) => b.id === selectedBranchId);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState<string>("__all__");
  const [date, setDate] = useState(todayIso());
  const [roster, setRoster] = useState<AttendanceRosterEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedBranchId) api.listClasses(selectedBranchId).then(setClasses);
  }, [selectedBranchId]);

  useEffect(() => {
    if (classId) {
      api.listSections(classId).then(setSections);
    } else {
      setSections([]);
    }
    setSectionId("__all__");
  }, [classId]);

  useEffect(() => {
    if (!selectedBranchId || !classId) {
      setRoster([]);
      return;
    }
    api
      .getAttendanceRoster(selectedBranchId, classId, sectionId === "__all__" ? null : sectionId, date)
      .then(setRoster);
  }, [selectedBranchId, classId, sectionId, date]);

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setRoster((r) => r.map((entry) => (entry.student_id === studentId ? { ...entry, status } : entry)));
  };

  const markAll = (status: AttendanceStatus) => {
    setRoster((r) => r.map((entry) => ({ ...entry, status })));
  };

  const handleSave = async () => {
    if (!selectedBranchId || !classId) return;
    setIsSaving(true);
    setSavedMessage(null);
    try {
      const entries = roster
        .filter((r) => r.status)
        .map((r) => ({ student_id: r.student_id, status: r.status as AttendanceStatus, remarks: r.remarks }));
      await api.markAttendance({
        branch_id: selectedBranchId,
        class_id: classId,
        section_id: sectionId === "__all__" ? null : sectionId,
        attendance_date: date,
        entries,
      });
      setSavedMessage(`Saved attendance for ${entries.length} student(s).`);
    } finally {
      setIsSaving(false);
    }
  };

  const className = classes.find((c) => c.id === classId)?.name;
  const sectionName = sections.find((s) => s.id === sectionId)?.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between" data-no-print>
        <div>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-muted-foreground">Mark daily attendance for a class.</p>
        </div>
        {roster.length > 0 && (
          <Button variant="outline" onClick={() => window.print()}>
            <PrinterIcon />
            Print register
          </Button>
        )}
      </div>

      <Card data-no-print>
        <CardHeader>
          <CardTitle className="text-base">Select class &amp; date</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Section</Label>
            <Select value={sectionId} onValueChange={setSectionId} disabled={sections.length === 0}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All sections</SelectItem>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attendance-date">Date</Label>
            <Input
              id="attendance-date"
              type="date"
              className="w-40"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {roster.length > 0 && (
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => markAll("present")}>
                Mark all present
              </Button>
              <Button variant="outline" size="sm" onClick={() => markAll("absent")}>
                Mark all absent
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {classId && (
        <div className="rounded-lg border" data-no-print>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((entry) => (
                <TableRow key={entry.student_id}>
                  <TableCell className="font-medium">
                    {entry.first_name} {entry.last_name ?? ""}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={entry.status ?? undefined}
                      onValueChange={(v) => setStatus(entry.student_id, v as AttendanceStatus)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Not marked" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
              {roster.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                    No students in this class/section.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {classId && roster.length > 0 && (
        <div className="flex items-center gap-3" data-no-print>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save attendance"}
          </Button>
          {savedMessage && <p className="text-sm text-muted-foreground">{savedMessage}</p>}
        </div>
      )}

      {roster.length > 0 && (
        <div data-print-area className="hidden p-6 print:block">
          <div className="mb-4 flex items-center justify-between border-b pb-3">
            <div>
              <p className="text-lg font-bold">{branch?.name ?? "Vidyalaya School"}</p>
              <p className="text-sm text-slate-600">Attendance Register</p>
            </div>
            <div className="text-right text-sm text-slate-600">
              <p>
                Class: {className ?? "—"} {sectionName ? `- ${sectionName}` : ""}
              </p>
              <p>Date: {date}</p>
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2">
                <th className="py-1.5 text-left">#</th>
                <th className="py-1.5 text-left">Student Name</th>
                <th className="py-1.5 text-left">Status</th>
                <th className="py-1.5 text-left">Signature</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((entry, i) => (
                <tr key={entry.student_id} className="border-b">
                  <td className="py-1.5">{i + 1}</td>
                  <td className="py-1.5">
                    {entry.first_name} {entry.last_name ?? ""}
                  </td>
                  <td className="py-1.5 capitalize">{entry.status?.replace("_", " ") ?? ""}</td>
                  <td className="py-1.5"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
