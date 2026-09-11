import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SearchIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type StudentListItem, type StudentStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NewAdmissionDialog } from "./new-admission-dialog";

const statusVariant: Record<StudentStatus, "default" | "secondary" | "outline"> = {
  enquiry: "outline",
  applied: "secondary",
  enrolled: "default",
  alumni: "outline",
  withdrawn: "outline",
};

export function StudentListPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const refresh = useCallback(() => {
    if (!selectedBranchId) return;
    api.listStudents(selectedBranchId, search).then(setStudents);
  }, [selectedBranchId, search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Students &amp; Admissions</h1>
          <p className="text-muted-foreground">
            {students.length} student{students.length === 1 ? "" : "s"} at this branch
          </p>
        </div>
        <NewAdmissionDialog onCreated={refresh} />
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or admission number..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Admission #</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => (
              <TableRow
                key={student.id}
                className="cursor-pointer"
                onClick={() => navigate(`/students/${student.id}`)}
              >
                <TableCell className="font-medium">
                  {student.first_name} {student.last_name ?? ""}
                </TableCell>
                <TableCell>{student.admission_number ?? "—"}</TableCell>
                <TableCell>
                  {student.class_name ? `${student.class_name} ${student.section_name ?? ""}` : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[student.status]}>{student.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {students.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No students yet. Click "New Admission" to add the first one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
