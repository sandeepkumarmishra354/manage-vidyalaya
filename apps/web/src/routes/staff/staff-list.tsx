import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SearchIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type StaffCategory, type StaffListItem, type StaffStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NewStaffDialog } from "./new-staff-dialog";

const ALL = "__all__";

const statusVariant: Record<StaffStatus, "success" | "warning" | "secondary" | "outline"> = {
  active: "success",
  on_leave: "warning",
  inactive: "secondary",
  terminated: "outline",
};

const STATUS_OPTIONS: StaffStatus[] = ["active", "on_leave", "inactive", "terminated"];

export function StaffListPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [staff, setStaff] = useState<StaffListItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [department, setDepartment] = useState("");
  const [categories, setCategories] = useState<StaffCategory[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.listStaffCategories().then(setCategories);
  }, []);

  const refresh = useCallback(() => {
    if (!selectedBranchId) return;
    api
      .listStaff(selectedBranchId, search, {
        status: statusFilter === ALL ? undefined : (statusFilter as StaffStatus),
        category_id: categoryFilter === ALL ? undefined : categoryFilter,
        department: department || undefined,
      })
      .then(setStaff);
  }, [selectedBranchId, search, statusFilter, categoryFilter, department]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Staff</h1>
          <p className="text-muted-foreground">
            {staff.length} staff member{staff.length === 1 ? "" : "s"} at this branch
          </p>
        </div>
        {hasPermission("staff.manage_profile") && <NewStaffDialog onCreated={refresh} />}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, or designation..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Department"
            className="w-40"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
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
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Employee code</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/staff/${s.id}`)}>
                  <TableCell className="font-medium">
                    {s.first_name} {s.last_name ?? ""}
                  </TableCell>
                  <TableCell>{s.employee_code}</TableCell>
                  <TableCell>{s.designation}</TableCell>
                  <TableCell>{s.department ?? "—"}</TableCell>
                  <TableCell>{s.has_login ? <Badge variant="outline">Yes</Badge> : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[s.status]}>{s.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {staff.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No staff match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
