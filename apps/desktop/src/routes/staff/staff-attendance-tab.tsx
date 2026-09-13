import { useCallback, useEffect, useState } from "react";

import { useAppStore } from "@/stores/app-store";
import { api, type AttendanceStatus, type StaffAttendanceRosterEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_OPTIONS: AttendanceStatus[] = ["present", "absent", "half_day", "leave"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function StaffAttendanceTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [date, setDate] = useState(todayIso());
  const [roster, setRoster] = useState<StaffAttendanceRosterEntry[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [isSaving, setIsSaving] = useState(false);

  const refresh = useCallback(() => {
    if (!selectedBranchId) return;
    api.getStaffAttendanceRoster(selectedBranchId, date).then((rows) => {
      setRoster(rows);
      setStatuses(Object.fromEntries(rows.map((r) => [r.staff_id, r.status ?? "present"])));
    });
  }, [selectedBranchId, date]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = async () => {
    if (!selectedBranchId) return;
    setIsSaving(true);
    try {
      await api.markStaffAttendance({
        branch_id: selectedBranchId,
        attendance_date: date,
        entries: Object.entries(statuses).map(([staff_id, status]) => ({ staff_id, status })),
      });
      refresh();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        {hasPermission("staff_attendance.mark") && (
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save attendance"}
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
            {roster.map((r) => (
              <TableRow key={r.staff_id}>
                <TableCell className="font-medium">
                  {r.first_name} {r.last_name ?? ""}
                </TableCell>
                <TableCell>{r.designation}</TableCell>
                <TableCell>
                  <Select
                    value={statuses[r.staff_id] ?? "present"}
                    onValueChange={(v) => setStatuses((s) => ({ ...s, [r.staff_id]: v as AttendanceStatus }))}
                    disabled={!hasPermission("staff_attendance.mark")}
                  >
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
            {roster.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  No active staff at this branch.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
