import { useCallback, useEffect, useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type StaffLeaveRequestListItem, type StaffLeaveStatus } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { PersonLink } from "@/components/person-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_VARIANT: Record<StaffLeaveStatus, "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "secondary",
};

function RejectDialog({ id, onDecided }: { id: string; onDecided: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.decideStaffLeave(id, "rejected", note || undefined);
      setNote("");
      setOpen(false);
      onDecided();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <XIcon className="size-3.5" />
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject leave request</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reject-note">Note (optional)</Label>
            <Input id="reject-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no coverage available" />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? "Rejecting..." : "Reject request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveRequestsPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [requests, setRequests] = useState<StaffLeaveRequestListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");

  const refresh = useCallback(() => {
    if (!selectedBranchId) return;
    api.listStaffLeave(selectedBranchId, statusFilter === "all" ? undefined : statusFilter).then(setRequests);
  }, [selectedBranchId, statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleApprove = async (id: string) => {
    await api.decideStaffLeave(id, "approved");
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leave Requests</h1>
          <p className="text-muted-foreground">Review and decide staff leave requests for this branch.</p>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "pending" | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending only</SelectItem>
            <SelectItem value="all">All requests</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent>
          <Table className="hidden sm:table">
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <PersonLink type="staff" id={r.staff_id} name={r.staff_name} />
                  </TableCell>
                  <TableCell>
                    {formatDate(r.start_date)}
                    {r.start_date !== r.end_date ? ` – ${formatDate(r.end_date)}` : ""}
                    {r.is_half_day && (
                      <Badge variant="info" className="ml-2">
                        Half day
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{r.reason ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.status === "pending" && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleApprove(r.id)}>
                          <CheckIcon className="size-3.5" />
                          Approve
                        </Button>
                        <RejectDialog id={r.id} onDecided={refresh} />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No {statusFilter === "pending" ? "pending " : ""}leave requests.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col divide-y sm:hidden">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <PersonLink type="staff" id={r.staff_id} name={r.staff_name} />
                  <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDate(r.start_date)}
                  {r.start_date !== r.end_date ? ` – ${formatDate(r.end_date)}` : ""}
                </p>
                {r.is_half_day && <Badge variant="info" className="w-fit">Half day</Badge>}
                {r.reason && <p className="text-sm text-muted-foreground">{r.reason}</p>}
                {r.status === "pending" && (
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => handleApprove(r.id)}>
                      <CheckIcon className="size-3.5" />
                      Approve
                    </Button>
                    <RejectDialog id={r.id} onDecided={refresh} />
                  </div>
                )}
              </div>
            ))}
            {requests.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">
                No {statusFilter === "pending" ? "pending " : ""}leave requests.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
