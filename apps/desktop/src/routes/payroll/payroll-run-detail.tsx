import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PrinterIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type Payslip, type PayrollRunDetail as PayrollRunDetailType } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPaise } from "@/lib/money";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function PayrollRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const branches = useAppStore((s) => s.branches);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [detail, setDetail] = useState<PayrollRunDetailType | null>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

  const refresh = useCallback(() => {
    if (runId) api.getPayrollRun(runId).then(setDetail);
  }, [runId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const branch = branches.find((b) => b.id === detail?.branch_id);

  if (!detail) return <p className="text-muted-foreground">Loading...</p>;

  const handleFinalize = async () => {
    if (!runId) return;
    await api.finalizePayrollRun(runId);
    refresh();
  };

  const handleMarkPaid = async (payslipId: string) => {
    await api.markPayslipPaid(payslipId, new Date().toISOString().slice(0, 10));
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between" data-no-print>
        <div>
          <h1 className="text-2xl font-semibold">
            Payroll — {MONTH_NAMES[detail.period_month - 1]} {detail.period_year}
          </h1>
          <p className="text-muted-foreground">
            {detail.payslips.length} payslip{detail.payslips.length === 1 ? "" : "s"} · <Badge variant="outline">{detail.status}</Badge>
          </p>
        </div>
        {detail.status === "draft" && hasPermission("payroll.finalize") && (
          <Button onClick={handleFinalize}>Finalize run</Button>
        )}
      </div>

      <div className="rounded-lg border" data-no-print>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Days present</TableHead>
              <TableHead>LOP days</TableHead>
              <TableHead>Gross</TableHead>
              <TableHead>Deductions</TableHead>
              <TableHead>Net pay</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.payslips.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.staff_name}</TableCell>
                <TableCell>{p.days_present}</TableCell>
                <TableCell>{p.days_lop}</TableCell>
                <TableCell>{formatPaise(p.gross_earnings)}</TableCell>
                <TableCell>{formatPaise(p.total_deductions)}</TableCell>
                <TableCell className="font-semibold">{formatPaise(p.net_pay)}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "paid" ? "default" : "outline"}>{p.status}</Badge>
                </TableCell>
                <TableCell className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPayslip(p)}>
                    <PrinterIcon />
                  </Button>
                  {p.status === "finalized" && hasPermission("payroll.finalize") && (
                    <Button variant="outline" size="sm" onClick={() => handleMarkPaid(p.id)}>
                      Mark paid
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {detail.payslips.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No payslips in this run -- staff need an assigned salary structure to be included.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectedPayslip && (
        <>
          <Card data-no-print>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{selectedPayslip.staff_name} — Payslip</CardTitle>
              <Button variant="outline" onClick={() => window.print()}>
                <PrinterIcon />
                Print
              </Button>
            </CardHeader>
            <CardContent>
              <PayslipLines payslip={selectedPayslip} />
            </CardContent>
          </Card>

          <div data-print-area className="hidden p-8 print:block">
            <div className="mb-6 flex items-center justify-between border-b-2 pb-4">
              <div>
                <p className="text-xl font-bold">{branch?.name ?? "Vidyalaya School"}</p>
                <p className="text-sm text-slate-600">Payslip — {MONTH_NAMES[detail.period_month - 1]} {detail.period_year}</p>
              </div>
              <p className="font-medium">{selectedPayslip.staff_name}</p>
            </div>
            <PayslipLines payslip={selectedPayslip} />
          </div>
        </>
      )}
    </div>
  );
}

function PayslipLines({ payslip }: { payslip: Payslip }) {
  const earnings = payslip.line_items.filter((li) => li.component_type === "earning");
  const deductions = payslip.line_items.filter((li) => li.component_type === "deduction");

  return (
    <div className="grid grid-cols-2 gap-8 text-sm">
      <div>
        <p className="mb-2 font-semibold">Earnings</p>
        {earnings.map((li) => (
          <div key={li.id} className="flex justify-between border-b py-1">
            <span>{li.component_name}</span>
            <span>{formatPaise(li.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 font-semibold">
          <span>Gross</span>
          <span>{formatPaise(payslip.gross_earnings)}</span>
        </div>
      </div>
      <div>
        <p className="mb-2 font-semibold">Deductions</p>
        {deductions.map((li) => (
          <div key={li.id} className="flex justify-between border-b py-1">
            <span>{li.component_name}</span>
            <span>{formatPaise(li.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 font-semibold">
          <span>Total deductions</span>
          <span>{formatPaise(payslip.total_deductions)}</span>
        </div>
      </div>
      <div className="col-span-2 flex justify-between border-t-2 pt-2 text-base font-bold">
        <span>Net pay</span>
        <span>{formatPaise(payslip.net_pay)}</span>
      </div>
    </div>
  );
}
