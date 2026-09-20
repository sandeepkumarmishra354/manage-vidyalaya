import { useEffect, useState } from "react";

import { useAppStore } from "@/stores/app-store";
import { api, type SchoolClass, type Section } from "@/lib/api";
import type { PrintPaperColor, PrintTemplate } from "@/components/print-templates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttendanceReportTab } from "@/routes/attendance/attendance-report-tab";
import { StudentsReportTab } from "./students-report-tab";
import { StaffReportTab } from "./staff-report-tab";
import { PayrollReportTab } from "./payroll-report-tab";
import { FeesReportTab } from "./fees-report-tab";

// The student-attendance report needs a class (and optional section) to
// scope the query, the same way AttendancePage's own Report tab does --
// this small wrapper supplies that picker without duplicating
// AttendanceReportTab itself.
function StudentAttendanceReportTab({ branchId }: { branchId: string }) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("__all__");

  useEffect(() => {
    api.listClasses(branchId).then(setClasses);
  }, [branchId]);

  useEffect(() => {
    if (classId) {
      api.listSections(classId).then(setSections);
    } else {
      setSections([]);
    }
    setSectionId("__all__");
  }, [classId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
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
      </div>

      <AttendanceReportTab
        personType="student"
        branchId={branchId}
        classId={classId}
        sectionId={sectionId === "__all__" ? null : sectionId}
      />
    </div>
  );
}

export function ReportsPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const branches = useAppStore((s) => s.branches);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const branch = branches.find((b) => b.id === selectedBranchId);
  const template = (branch?.print_template as PrintTemplate) || "classic";
  const paperColor = (branch?.print_paper_color as PrintPaperColor) || "white";

  const tabs = [
    { value: "students", label: "Students", permission: "students.view" },
    { value: "staff", label: "Staff", permission: "staff.view" },
    { value: "payroll", label: "Payroll", permission: "payroll.view" },
    { value: "fees", label: "Fees", permission: "fees.view" },
    { value: "student-attendance", label: "Student Attendance", permission: "attendance.view" },
    { value: "staff-attendance", label: "Staff Attendance", permission: "staff_attendance.view" },
  ].filter((t) => hasPermission(t.permission));

  if (!selectedBranchId || tabs.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-muted-foreground">You don't have access to any report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div data-no-print>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-muted-foreground">Pick a date range, review the table, then export CSV or print.</p>
      </div>

      <Tabs defaultValue={tabs[0].value}>
        <TabsList data-no-print>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {hasPermission("students.view") && (
          <TabsContent value="students">
            <StudentsReportTab branchId={selectedBranchId} branch={branch} template={template} paperColor={paperColor} />
          </TabsContent>
        )}
        {hasPermission("staff.view") && (
          <TabsContent value="staff">
            <StaffReportTab branchId={selectedBranchId} branch={branch} template={template} paperColor={paperColor} />
          </TabsContent>
        )}
        {hasPermission("payroll.view") && (
          <TabsContent value="payroll">
            <PayrollReportTab branchId={selectedBranchId} branch={branch} template={template} paperColor={paperColor} />
          </TabsContent>
        )}
        {hasPermission("fees.view") && (
          <TabsContent value="fees">
            <FeesReportTab branchId={selectedBranchId} branch={branch} template={template} paperColor={paperColor} />
          </TabsContent>
        )}
        {hasPermission("attendance.view") && (
          <TabsContent value="student-attendance">
            <StudentAttendanceReportTab branchId={selectedBranchId} />
          </TabsContent>
        )}
        {hasPermission("staff_attendance.view") && (
          <TabsContent value="staff-attendance">
            <AttendanceReportTab personType="staff" branchId={selectedBranchId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
