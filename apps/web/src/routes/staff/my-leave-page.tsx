import { useCallback, useEffect, useState } from "react";
import { CalendarOffIcon, PlusIcon } from "lucide-react";

import { api, type LeaveBalanceEntry, type LeaveType, type StaffLeaveRequest, type StaffLeaveStatus } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function ApplyLeaveDialog({
  leaveTypes,
  balances,
  onApplied,
}: {
  leaveTypes: LeaveType[];
  balances: LeaveBalanceEntry[];
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leaveTypeId && leaveTypes.length > 0) setLeaveTypeId(leaveTypes[0]!.id);
  }, [leaveTypeId, leaveTypes]);

  const selectedBalance = balances.find((b) => b.leave_type_id === leaveTypeId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.applyStaffLeave({
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: isHalfDay ? startDate : endDate,
        reason: reason || null,
        is_half_day: isHalfDay,
      });
      setStartDate("");
      setEndDate("");
      setReason("");
      setIsHalfDay(false);
      setOpen(false);
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          Apply for leave
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Leave type</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBalance && selectedBalance.remaining_days != null && (
              <p className="text-xs text-muted-foreground">
                {selectedBalance.remaining_days} of {selectedBalance.accrued_days} day(s) remaining this year.
                Requesting beyond this will be approved as unpaid leave.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leave-start">Start date</Label>
              <Input
                id="leave-start"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (isHalfDay) setEndDate(e.target.value);
                }}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leave-end">End date</Label>
              <Input
                id="leave-end"
                type="date"
                value={isHalfDay ? startDate : endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isHalfDay}
                required
              />
            </div>
          </div>
          <label htmlFor="leave-half-day" className="flex items-center gap-2 text-sm">
            <input
              id="leave-half-day"
              type="checkbox"
              className="size-4 rounded border-input"
              checked={isHalfDay}
              onChange={(e) => {
                setIsHalfDay(e.target.checked);
                if (e.target.checked) setEndDate(startDate);
              }}
            />
            Half day (deducts half day's pay)
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leave-reason">Reason (optional)</Label>
            <Input id="leave-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. family function" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !leaveTypeId}>
              {isSubmitting ? "Submitting..." : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MyLeavePage() {
  const [requests, setRequests] = useState<StaffLeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalanceEntry[]>([]);
  const [notLinked, setNotLinked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    setIsLoading(true);
    setNotLinked(false);
    api
      .getMyStaffLeave()
      .then(setRequests)
      .catch(() => setNotLinked(true))
      .finally(() => setIsLoading(false));
    api.getMyLeaveBalance().then(setBalances).catch(() => setBalances([]));
  }, []);

  useEffect(() => {
    refresh();
    api.listLeaveTypes().then(setLeaveTypes);
  }, [refresh]);

  const handleCancel = async (id: string) => {
    await api.cancelStaffLeave(id);
    refresh();
  };

  if (isLoading) {
    return null;
  }

  if (notLinked) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">My Leave</h1>
          <p className="text-muted-foreground">Apply for leave and track your requests.</p>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Your login isn't linked to a staff record, so there's nothing to apply leave against here. Contact your
            admin if this seems wrong.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Leave</h1>
          <p className="text-muted-foreground">Apply for leave and track your requests.</p>
        </div>
        <ApplyLeaveDialog leaveTypes={leaveTypes} balances={balances} onApplied={refresh} />
      </div>

      {balances.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leave balance ({new Date().getFullYear()})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            {balances.map((b) => (
              <div key={b.leave_type_id} className="flex flex-col gap-0.5 rounded-lg border px-3 py-2">
                <span className="text-sm font-medium">{b.leave_type_name}</span>
                <span className="text-xs text-muted-foreground">
                  {b.remaining_days != null ? `${b.remaining_days} of ${b.accrued_days} remaining` : "No quota configured"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="hidden sm:table">
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.leave_type_name ?? "—"}
                    {r.status === "approved" && r.unpaid_days != null && r.unpaid_days > 0 && (
                      <Badge variant="destructive" className="ml-2">
                        {r.unpaid_days} unpaid
                      </Badge>
                    )}
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
                  <TableCell className="text-muted-foreground">{r.decision_note ?? "—"}</TableCell>
                  <TableCell>
                    {r.status === "pending" && (
                      <Button variant="ghost" size="sm" onClick={() => handleCancel(r.id)}>
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    <CalendarOffIcon className="mx-auto mb-2 size-6 text-muted-foreground/60" />
                    No leave requests yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col divide-y sm:hidden">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {r.leave_type_name ? `${r.leave_type_name} · ` : ""}
                    {formatDate(r.start_date)}
                    {r.start_date !== r.end_date ? ` – ${formatDate(r.end_date)}` : ""}
                  </p>
                  <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                </div>
                {r.is_half_day && <Badge variant="info" className="w-fit">Half day</Badge>}
                {r.status === "approved" && r.unpaid_days != null && r.unpaid_days > 0 && (
                  <Badge variant="destructive" className="w-fit">
                    {r.unpaid_days} unpaid
                  </Badge>
                )}
                {r.reason && <p className="text-sm text-muted-foreground">{r.reason}</p>}
                {r.decision_note && <p className="text-xs text-muted-foreground">Note: {r.decision_note}</p>}
                {r.status === "pending" && (
                  <Button variant="outline" size="sm" className="w-fit" onClick={() => handleCancel(r.id)}>
                    Cancel
                  </Button>
                )}
              </div>
            ))}
            {requests.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">
                <CalendarOffIcon className="mx-auto mb-2 size-6 text-muted-foreground/60" />
                No leave requests yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
