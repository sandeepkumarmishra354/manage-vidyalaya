import { useEffect, useState } from "react";
import { PrinterIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  type AttendanceRosterEntry,
  type AttendanceStatus,
  type SchoolClass,
  type Section,
  type StaffAttendanceRosterEntry,
} from "@/lib/api";
import { PersonLink } from "@/components/person-link";
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
import { cn } from "@/lib/utils";
import { AttendanceCalendar } from "./attendance-calendar";
import { AttendanceReportTab } from "./attendance-report-tab";
import { StaffAttendanceCalendar } from "../staff/staff-attendance-calendar";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "half_day", label: "Half Day" },
  { value: "leave", label: "Leave" },
];

const STAFF_STATUS_OPTIONS: AttendanceStatus[] = ["present", "absent", "half_day", "leave"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function AttendancePage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const branches = useAppStore((s) => s.branches);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const branch = branches.find((b) => b.id === selectedBranchId);
  const template = (branch?.print_template as PrintTemplate) || "classic";
  const paperColor = (branch?.print_paper_color as PrintPaperColor) || "white";
  const [personType, setPersonType] = useState<"student" | "staff">("student");

  // Student branch state
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
  const classTeacherStaffId = sections.find((s) => s.id === sectionId)?.class_teacher_staff_id;

  const [classTeacherSignatureUrl, setClassTeacherSignatureUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (classTeacherStaffId) {
      api.getStaffSignature(classTeacherStaffId).then((r) => setClassTeacherSignatureUrl(r.signature_url));
    } else {
      setClassTeacherSignatureUrl(undefined);
    }
  }, [classTeacherStaffId]);

  // Staff branch state
  const canMarkStaff = hasPermission("staff_attendance.mark");
  const [staffDate, setStaffDate] = useState(todayIso());
  const [staffRoster, setStaffRoster] = useState<StaffAttendanceRosterEntry[]>([]);
  const [staffStatuses, setStaffStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [isStaffSaving, setIsStaffSaving] = useState(false);

  useEffect(() => {
    if (personType !== "staff" || !selectedBranchId) return;
    api.getStaffAttendanceRoster(selectedBranchId, staffDate).then((rows) => {
      setStaffRoster(rows);
      setStaffStatuses(Object.fromEntries(rows.map((r) => [r.staff_id, r.status ?? "present"])));
    });
  }, [personType, selectedBranchId, staffDate]);

  const handleStaffSave = async () => {
    if (!selectedBranchId) return;
    setIsStaffSaving(true);
    try {
      await api.markStaffAttendance({
        branch_id: selectedBranchId,
        attendance_date: staffDate,
        entries: Object.entries(staffStatuses).map(([staff_id, status]) => ({ staff_id, status })),
      });
      const rows = await api.getStaffAttendanceRoster(selectedBranchId, staffDate);
      setStaffRoster(rows);
    } finally {
      setIsStaffSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between" data-no-print>
        <div>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-muted-foreground">Mark and review attendance for students or staff.</p>
        </div>
        {personType === "student" && roster.length > 0 && (
          <Button variant="outline" onClick={() => window.print()}>
            <PrinterIcon />
            Print register
          </Button>
        )}
      </div>

      <div className="flex gap-2" data-no-print>
        <Button
          variant={personType === "student" ? "default" : "outline"}
          className={cn(personType !== "student" && "text-muted-foreground")}
          onClick={() => setPersonType("student")}
        >
          Students
        </Button>
        <Button
          variant={personType === "staff" ? "default" : "outline"}
          className={cn(personType !== "staff" && "text-muted-foreground")}
          onClick={() => setPersonType("staff")}
        >
          Staff
        </Button>
      </div>

      {personType === "student" ? (
        <>
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
                <TabsTrigger value="report">Report</TabsTrigger>
              </TabsList>

              <TabsContent value="daily" className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end gap-4" data-no-print>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="attendance-date">Date</Label>
                    <Input
                      id="attendance-date"
                      type="date"
                      className="w-40"
                      max={todayIso()}
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
                            <PersonLink
                              type="student"
                              id={entry.student_id}
                              name={`${entry.first_name} ${entry.last_name ?? ""}`}
                            />
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
                        <SignatureBlock
                          branch={branch}
                          signatureUrl={classTeacherSignatureUrl}
                          label="Class Teacher Signature"
                          template={template}
                          accent="var(--color-academics)"
                        />
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

              <TabsContent value="report" data-no-print>
                {selectedBranchId && (
                  <AttendanceReportTab
                    personType="student"
                    branchId={selectedBranchId}
                    classId={classId}
                    sectionId={resolvedSectionId}
                  />
                )}
              </TabsContent>
            </Tabs>
          )}
        </>
      ) : (
        <Tabs defaultValue="daily">
          <TabsList data-no-print>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="report">Report</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="flex flex-col gap-4">
            <div className="flex items-end gap-3" data-no-print>
              <div className="flex flex-col gap-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  max={todayIso()}
                  value={staffDate}
                  onChange={(e) => setStaffDate(e.target.value)}
                  className="w-44"
                />
              </div>
              {canMarkStaff && (
                <Button onClick={handleStaffSave} disabled={isStaffSaving}>
                  {isStaffSaving ? "Saving..." : "Save attendance"}
                </Button>
              )}
            </div>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffRoster.map((r) => (
                    <TableRow key={r.staff_id}>
                      <TableCell className="font-medium">
                        <PersonLink type="staff" id={r.staff_id} name={`${r.first_name} ${r.last_name ?? ""}`} />
                      </TableCell>
                      <TableCell>{r.designation}</TableCell>
                      <TableCell>
                        {canMarkStaff ? (
                          <Select
                            value={staffStatuses[r.staff_id] ?? "present"}
                            onValueChange={(v) => setStaffStatuses((s) => ({ ...s, [r.staff_id]: v as AttendanceStatus }))}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAFF_STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s.replace("_", " ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="capitalize">{(staffStatuses[r.staff_id] ?? "present").replace("_", " ")}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {staffRoster.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                        No active staff at this branch.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="calendar">
            {selectedBranchId && <StaffAttendanceCalendar branchId={selectedBranchId} canMark={canMarkStaff} />}
          </TabsContent>

          <TabsContent value="report">
            {selectedBranchId && <AttendanceReportTab personType="staff" branchId={selectedBranchId} />}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
