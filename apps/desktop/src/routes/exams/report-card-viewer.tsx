import { useEffect, useState } from "react";

import { api, type Exam, type ReportCard, type StudentListItem } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function ReportCardViewer({ exam }: { exam: Exam }) {
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

      {reportCard && (
        <Card>
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
    </div>
  );
}
