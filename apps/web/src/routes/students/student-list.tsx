import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SearchIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppStore } from "@/stores/app-store";
import { api, type MasterDataItem, type StudentStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NewAdmissionDialog } from "./new-admission-dialog";

const ALL = "__all__";

const statusVariant: Record<StudentStatus, "outline" | "info" | "success" | "secondary" | "warning"> = {
  enquiry: "outline",
  applied: "info",
  enrolled: "success",
  alumni: "secondary",
  withdrawn: "warning",
};

const STATUS_OPTIONS: StudentStatus[] = ["enquiry", "applied", "enrolled", "alumni", "withdrawn"];

export function StudentListPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [classFilter, setClassFilter] = useState(ALL);
  const [sectionFilter, setSectionFilter] = useState(ALL);
  const [genderFilter, setGenderFilter] = useState(ALL);
  const [genders, setGenders] = useState<MasterDataItem[]>([]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    api.listMasterDataItems("gender").then(setGenders);
  }, []);

  useEffect(() => {
    setSectionFilter(ALL);
  }, [classFilter]);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", selectedBranchId],
    queryFn: () => api.listClasses(selectedBranchId!),
    enabled: !!selectedBranchId,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["sections", classFilter],
    queryFn: () => api.listSections(classFilter),
    enabled: classFilter !== ALL,
  });

  const filters = {
    search,
    status: statusFilter === ALL ? undefined : (statusFilter as StudentStatus),
    class_id: classFilter === ALL ? undefined : classFilter,
    section_id: sectionFilter === ALL ? undefined : sectionFilter,
    gender: genderFilter === ALL ? undefined : genderFilter,
  };

  const { data: students = [] } = useQuery({
    queryKey: ["students", selectedBranchId, filters],
    queryFn: () => api.listStudents(selectedBranchId!, filters),
    enabled: !!selectedBranchId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["students", selectedBranchId] });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Students &amp; Admissions</h1>
          <p className="text-muted-foreground">
            {students.length} student{students.length === 1 ? "" : "s"} at this branch
          </p>
        </div>
        {hasPermission("admissions.create") && <NewAdmissionDialog onCreated={refresh} />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or admission number..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All classes</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sectionFilter} onValueChange={setSectionFilter} disabled={classFilter === ALL}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sections</SelectItem>
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={genderFilter} onValueChange={setGenderFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All genders</SelectItem>
            {genders.map((g) => (
              <SelectItem key={g.id} value={g.name}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  No students match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
