import { useCallback, useEffect, useState } from "react";
import { CalendarOffIcon, PlusIcon } from "lucide-react";

import { api, type StaffLeaveRequest, type StaffLeaveStatus } from "@/lib/api";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_VARIANT: Record<StaffLeaveStatus, "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "secondary",
};

function ApplyLeaveDialog({ onApplied }: { onApplied: () => void }) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.applyStaffLeave({ start_date: startDate, end_date: endDate, reason: reason || null });
      setStartDate("");
      setEndDate("");
      setReason("");
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
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leave-start">Start date</Label>
              <Input id="leave-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leave-end">End date</Label>
              <Input id="leave-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leave-reason">Reason (optional)</Label>
            <Input id="leave-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. family function" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
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
  }, []);

  useEffect(() => {
    refresh();
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
        <ApplyLeaveDialog onApplied={refresh} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
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
                    {formatDate(r.start_date)}
                    {r.start_date !== r.end_date ? ` – ${formatDate(r.end_date)}` : ""}
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
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    <CalendarOffIcon className="mx-auto mb-2 size-6 text-muted-foreground/60" />
                    No leave requests yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
