import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SearchIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type StaffListItem, type StaffStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewStaffDialog } from "./new-staff-dialog";
import { StaffAttendanceTab } from "./staff-attendance-tab";

const statusVariant: Record<StaffStatus, "success" | "warning" | "secondary" | "outline"> = {
  active: "success",
  on_leave: "warning",
  inactive: "secondary",
  terminated: "outline",
};

export function StaffListPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [staff, setStaff] = useState<StaffListItem[]>([]);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const refresh = useCallback(() => {
    if (!selectedBranchId) return;
    api.listStaff(selectedBranchId, search).then(setStaff);
  }, [selectedBranchId, search]);

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

      <Tabs defaultValue="directory">
        <TabsList>
          <TabsTrigger value="directory">Directory</TabsTrigger>
          <TabsTrigger value="attendance">Today's Attendance</TabsTrigger>
        </TabsList>
        <TabsContent value="directory">
          <div className="flex flex-col gap-4">
            <div className="relative max-w-sm">
              <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, or designation..."
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
                        No staff yet. Click "New Staff" to add the first one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="attendance">
          <StaffAttendanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
