import { useEffect, useState } from "react";
import { PrinterIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type Exam, type ReportCard, type StudentListItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function ReportCardViewer({ exam }: { exam: Exam }) {
  const branches = useAppStore((s) => s.branches);
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const branch = branches.find((b) => b.id === selectedBranchId);

  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [studentId, setStudentId] = useState("");
  const [reportCard, setReportCard] = useState<ReportCard | null>(null);

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
            <CardTitle className="text-base">
              {reportCard.student_name} -- {reportCard.exam_name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Max marks</TableHead>
                  <TableHead>Obtained</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportCard.rows.map((row) => (
                  <TableRow key={row.subject_name}>
                    <TableCell>{row.subject_name}</TableCell>
                    <TableCell>{row.max_marks}</TableCell>
                    <TableCell>{row.is_absent ? "Absent" : (row.marks_obtained ?? "—")}</TableCell>
                  </TableRow>
                ))}
                {reportCard.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
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
        <div data-print-area className="hidden p-8 print:block">
          <div className="mb-6 flex items-center justify-between border-b-2 pb-4">
            <div>
              <p className="text-xl font-bold">{branch?.name ?? "Vidyalaya School"}</p>
              <p className="text-sm text-slate-600">Report Card</p>
            </div>
            <div className="text-right text-sm text-slate-600">
              <p className="font-medium text-slate-900">{reportCard.exam_name}</p>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-lg font-semibold">{reportCard.student_name}</p>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2">
                <th className="py-2 text-left">Subject</th>
                <th className="py-2 text-right">Max Marks</th>
                <th className="py-2 text-right">Obtained</th>
              </tr>
            </thead>
            <tbody>
              {reportCard.rows.map((row) => (
                <tr key={row.subject_name} className="border-b">
                  <td className="py-2">{row.subject_name}</td>
                  <td className="py-2 text-right">{row.max_marks}</td>
                  <td className="py-2 text-right">{row.is_absent ? "Absent" : (row.marks_obtained ?? "—")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right">{reportCard.total_max}</td>
                <td className="py-2 text-right">
                  {reportCard.total_obtained} ({reportCard.percentage.toFixed(1)}%)
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-16 flex justify-between text-sm text-slate-600">
            <div className="border-t border-slate-400 pt-1">Class Teacher</div>
            <div className="border-t border-slate-400 pt-1">Principal</div>
          </div>
        </div>
      )}
    </div>
  );
}
