import { useEffect, useState } from "react";
import { PrinterIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type Exam, type ReportCard, type StudentListItem } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { PrintLetterhead } from "@/components/print-letterhead";
import { PrintFrame, type PrintPaperColor, type PrintTemplate } from "@/components/print-templates";
import { SignatureBlock } from "@/components/signature-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const OVERALL_BADGE_VARIANT = { pass: "success", fail: "destructive", pending: "outline" } as const;

export function ReportCardViewer({ exam }: { exam: Exam }) {
  const branches = useAppStore((s) => s.branches);
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const branch = branches.find((b) => b.id === selectedBranchId);
  const template = (branch?.print_template as PrintTemplate) || "classic";
  const paperColor = (branch?.print_paper_color as PrintPaperColor) || "white";

  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [studentId, setStudentId] = useState("");
  const [reportCard, setReportCard] = useState<ReportCard | null>(null);
  const [classTeacherSignatureUrl, setClassTeacherSignatureUrl] = useState<string | null | undefined>(undefined);
  const [principalSignatureUrl, setPrincipalSignatureUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    api.listStudentsInClass(exam.class_id).then(setStudents);
  }, [exam.class_id]);

  useEffect(() => {
    if (studentId) {
      api.getReportCard(studentId, exam.id).then(setReportCard);
    } else {
      setReportCard(null);
    }
  }, [studentId, exam.id]);

  // Resolve the printed student's own section's class teacher signature --
  // not necessarily the same for every student in the exam's class.
  useEffect(() => {
    if (!studentId) {
      setClassTeacherSignatureUrl(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      const student = await api.getStudent(studentId);
      const sectionId = student.current_section_id;
      if (!sectionId) {
        if (!cancelled) setClassTeacherSignatureUrl(undefined);
        return;
      }
      const sections = await api.listSections(exam.class_id);
      const staffId = sections.find((s) => s.id === sectionId)?.class_teacher_staff_id;
      if (!staffId) {
        if (!cancelled) setClassTeacherSignatureUrl(undefined);
        return;
      }
      const { signature_url } = await api.getStaffSignature(staffId);
      if (!cancelled) setClassTeacherSignatureUrl(signature_url);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, exam.class_id]);

  useEffect(() => {
    if (selectedBranchId) {
      api.getPrincipalSignature(selectedBranchId).then((r) => setPrincipalSignatureUrl(r.signature_url));
    }
  }, [selectedBranchId]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between" data-no-print>
        <Select value={studentId} onValueChange={setStudentId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select a student" />
          </SelectTrigger>
          <SelectContent>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.first_name} {s.last_name ?? ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {reportCard && reportCard.rows.length > 0 && (
          <Button variant="outline" onClick={() => window.print()}>
            <PrinterIcon />
            Print report card
          </Button>
        )}
      </div>

      {reportCard && (
        <Card data-no-print>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {reportCard.student_name} -- {reportCard.exam_name}
              </CardTitle>
              <div className="flex items-center gap-2">
                {!reportCard.results_published && <Badge variant="outline">Provisional — Not Yet Published</Badge>}
                {reportCard.rows.length > 0 && (
                  <Badge variant={OVERALL_BADGE_VARIANT[reportCard.overall_result]} className="capitalize">
                    {reportCard.overall_result}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Max marks</TableHead>
                  <TableHead>Obtained</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Back paper</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportCard.rows.map((row) => (
                  <TableRow key={row.subject_name}>
                    <TableCell>{row.subject_name}</TableCell>
                    <TableCell>{row.max_marks}</TableCell>
                    <TableCell>{row.is_absent ? "Absent" : (row.marks_obtained ?? "—")}</TableCell>
                    <TableCell className="capitalize">{row.result ?? "—"}</TableCell>
                    <TableCell>{row.backpaper_marks_obtained ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {reportCard.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      No marks entered yet for this exam.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {reportCard.rows.length > 0 && (
              <p className="mt-4 text-sm font-medium">
                Total: {reportCard.total_obtained} / {reportCard.total_max} (
                {reportCard.percentage.toFixed(1)}%)
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {reportCard && reportCard.rows.length > 0 && (
        <div data-print-area className="relative hidden print:block">
          {!reportCard.results_published && (
            <p className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-6xl font-bold text-slate-200 select-none" style={{ transform: "rotate(-25deg)" }}>
              PROVISIONAL — NOT YET PUBLISHED
            </p>
          )}
          <PrintFrame template={template} paperColor={paperColor} branch={branch}>
            <PrintLetterhead
              branch={branch}
              documentTitle="Report Card"
              template={template}
              accent="var(--color-exams)"
              right={<p className="font-medium text-slate-900">{reportCard.exam_name}</p>}
            />

            <div className="mb-6 flex items-start justify-between">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                <p className="col-span-2 text-lg font-semibold">{reportCard.student_name}</p>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600">Class</span>
                  <span className="font-medium">
                    {[reportCard.class_name, reportCard.section_name].filter(Boolean).join(" - ") || "-"}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600">Roll number</span>
                  <span className="font-medium">{reportCard.roll_number ?? "-"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600">Date of birth</span>
                  <span className="font-medium">{formatDate(reportCard.date_of_birth) || "-"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600">Guardian</span>
                  <span className="font-medium">{reportCard.guardian_name ?? "-"}</span>
                </div>
              </div>
              <p className="font-medium capitalize">Overall: {reportCard.overall_result}</p>
            </div>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2">
                  <th className="py-2 text-left">Subject</th>
                  <th className="py-2 text-right">Max Marks</th>
                  <th className="py-2 text-right">Obtained</th>
                  <th className="py-2 text-right">Result</th>
                  <th className="py-2 text-right">Back Paper</th>
                </tr>
              </thead>
              <tbody>
                {reportCard.rows.map((row) => (
                  <tr key={row.subject_name} className="border-b">
                    <td className="py-2">{row.subject_name}</td>
                    <td className="py-2 text-right">{row.max_marks}</td>
                    <td className="py-2 text-right">{row.is_absent ? "Absent" : (row.marks_obtained ?? "—")}</td>
                    <td className="py-2 text-right capitalize">{row.result ?? "—"}</td>
                    <td className="py-2 text-right">{row.backpaper_marks_obtained ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{reportCard.total_max}</td>
                  <td className="py-2 text-right" colSpan={2}>
                    {reportCard.total_obtained} ({reportCard.percentage.toFixed(1)}%)
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            <div className="mt-16 flex justify-between text-sm text-slate-600">
              <SignatureBlock
                branch={branch}
                signatureUrl={classTeacherSignatureUrl}
                label="Class Teacher"
                template={template}
                accent="var(--color-exams)"
              />
              <SignatureBlock
                branch={branch}
                signatureUrl={principalSignatureUrl}
                label="Principal"
                template={template}
                accent="var(--color-exams)"
              />
            </div>
          </PrintFrame>
        </div>
      )}
    </div>
  );
}
