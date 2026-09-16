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
import { PrintLetterhead } from "@/components/print-letterhead";
import { PrintFrame, type PrintPaperColor, type PrintTemplate } from "@/components/print-templates";
import { SignatureBlock } from "@/components/signature-block";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttendanceCalendar } from "./attendance-calendar";

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
  const template = (branch?.print_template as PrintTemplate) || "classic";
  const paperColor = (branch?.print_paper_color as PrintPaperColor) || "white";
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState<string>("__all__");
  const [date, setDate] = useState(todayIso());
  const [roster, setRoster] = useState<AttendanceRosterEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [canMark, setCanMark] = useState(false);

  const resolvedSectionId = sectionId === "__all__" ? null : sectionId;

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

  // Additive authorization: broad attendance.mark holders can always mark;
  // otherwise a class teacher can mark their own section. Checked server-side
  // (via /attendance/can-mark) rather than a flat hasPermission() so class
  // teachers without the broad permission still see the marking controls.
  useEffect(() => {
    if (!classId) {
      setCanMark(false);
      return;
    }
    api.canMarkAttendance(resolvedSectionId).then((r) => setCanMark(r.can_mark));
  }, [classId, resolvedSectionId]);

  useEffect(() => {
    if (!selectedBranchId || !classId) {
      setRoster([]);
      return;
    }
    api.getAttendanceRoster(selectedBranchId, classId, resolvedSectionId, date).then(setRoster);
  }, [selectedBranchId, classId, resolvedSectionId, date]);

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
        section_id: resolvedSectionId,
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
        </CardContent>
      </Card>

      {classId && (
        <Tabs defaultValue="daily">
          <TabsList data-no-print>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-4" data-no-print>
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
              {roster.length > 0 && canMark && (
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => markAll("present")}>
                    Mark all present
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => markAll("absent")}>
                    Mark all absent
                  </Button>
                </div>
              )}
            </div>

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
                        {canMark ? (
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
                        ) : (
                          <span className="text-sm">
                            {STATUS_OPTIONS.find((opt) => opt.value === entry.status)?.label ?? "Not marked"}
                          </span>
                        )}
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

            {roster.length > 0 && canMark && (
              <div className="flex items-center gap-3" data-no-print>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save attendance"}
                </Button>
                {savedMessage && <p className="text-sm text-muted-foreground">{savedMessage}</p>}
              </div>
            )}

            {roster.length > 0 && (
              <div data-print-area className="hidden print:block">
                <PrintFrame template={template} paperColor={paperColor} branch={branch}>
                  <PrintLetterhead
                    branch={branch}
                    documentTitle="Attendance Register"
                    template={template}
                    accent="var(--color-academics)"
                    right={
                      <>
                        <p>
                          Class: {className ?? "—"} {sectionName ? `- ${sectionName}` : ""}
                        </p>
                        <p>Date: {date}</p>
                      </>
                    }
                  />
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
                  <div className="mt-16 flex justify-end">
                    <SignatureBlock branch={branch} label="Class Teacher Signature" template={template} accent="var(--color-academics)" />
                  </div>
                </PrintFrame>
              </div>
            )}
          </TabsContent>

          <TabsContent value="calendar" data-no-print>
            {selectedBranchId && (
              <AttendanceCalendar
                branchId={selectedBranchId}
                classId={classId}
                sectionId={resolvedSectionId}
                canMark={canMark}
              />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
