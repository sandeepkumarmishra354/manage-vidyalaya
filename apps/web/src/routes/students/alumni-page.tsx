import { useState } from "react";
import { SearchIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { PersonLink } from "@/components/person-link";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AlumniPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [search, setSearch] = useState("");

  const { data: alumni = [] } = useQuery({
    queryKey: ["students", selectedBranchId, "alumni", search],
    queryFn: () => api.listStudents(selectedBranchId!, { search, status: "alumni" }),
    enabled: !!selectedBranchId,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Alumni</h1>
        <p className="text-muted-foreground">
          {alumni.length} alumni{alumni.length === 1 ? "" : ""} from this branch
        </p>
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
              <TableHead>Graduation year</TableHead>
              <TableHead>Higher education</TableHead>
              <TableHead>Current occupation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alumni.map((student) => (
              <TableRow key={student.id}>
                <TableCell className="font-medium">
                  <PersonLink type="student" id={student.id} name={`${student.first_name} ${student.last_name ?? ""}`} />
                </TableCell>
                <TableCell>{student.admission_number ?? "—"}</TableCell>
                <TableCell>{student.graduation_year ?? "—"}</TableCell>
                <TableCell>{student.higher_education ?? "—"}</TableCell>
                <TableCell>{student.current_occupation ?? "—"}</TableCell>
              </TableRow>
            ))}
            {alumni.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No alumni yet. Mark a student's status as "Alumni" from their profile to list them here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
