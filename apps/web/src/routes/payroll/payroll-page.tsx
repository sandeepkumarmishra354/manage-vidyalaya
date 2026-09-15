import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlusIcon, XIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type PayrollRun } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const statusVariant: Record<PayrollRun["status"], "warning" | "info" | "success"> = {
  draft: "warning",
  finalized: "info",
  paid: "success",
};

function GenerateRunDialog({ onGenerated }: { onGenerated: (runId: string) => void }) {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const run = await api.generatePayrollRun({
        branch_id: selectedBranchId,
        period_month: Number(month),
        period_year: Number(year),
      });
      setOpen(false);
      onGenerated(run.run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          Generate payroll run
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a payroll run</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <p className="text-sm text-muted-foreground">
            Creates one payslip per active staff member with a salary structure. Loss-of-pay days are
            computed automatically from staff attendance for the period.
          </p>
          <div className="flex gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="year">Year</Label>
              <input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="h-9 w-24 rounded-md border border-input bg-transparent px-3 text-sm"
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PayrollPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const navigate = useNavigate();

  const refresh = useCallback(() => {
    if (selectedBranchId) api.listPayrollRuns(selectedBranchId).then(setRuns);
  }, [selectedBranchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const canManageRuns = hasPermission("payroll.manage_runs");

  const handleDelete = async (run: PayrollRun, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete the draft payroll run for ${MONTH_NAMES[run.period_month - 1]} ${run.period_year}?`)) {
      return;
    }
    await api.deletePayrollRun(run.id);
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payroll</h1>
          <p className="text-muted-foreground">Monthly payroll runs and payslips.</p>
        </div>
        {hasPermission("payroll.generate") && (
          <GenerateRunDialog onGenerated={(runId) => { refresh(); navigate(`/payroll/${runId}`); }} />
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Generated</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id} className="cursor-pointer" onClick={() => navigate(`/payroll/${run.id}`)}>
                <TableCell className="font-medium">
                  {MONTH_NAMES[run.period_month - 1]} {run.period_year}
                </TableCell>
                <TableCell>{run.generated_at.slice(0, 10)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[run.status]}>{run.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canManageRuns && run.status === "draft" && (
                    <Button variant="ghost" size="sm" onClick={(e) => handleDelete(run, e)}>
                      <XIcon className="size-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No payroll runs yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
