import { useState } from "react";
import { DownloadIcon, PrinterIcon } from "lucide-react";

import { api, type Branch, type PaymentListItem } from "@/lib/api";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/date";
import { PersonLink } from "@/components/person-link";
import type { PrintPaperColor, PrintTemplate } from "@/components/print-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportPrintTable } from "./report-print-table";

function firstOfMonthIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function FeesReportTab({
  branchId,
  branch,
  template,
  paperColor,
}: {
  branchId: string;
  branch?: Branch;
  template: PrintTemplate;
  paperColor: PrintPaperColor;
}) {
  const [fromDate, setFromDate] = useState(firstOfMonthIso());
  const [toDate, setToDate] = useState(todayIso());
  const [rows, setRows] = useState<PaymentListItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const data = await api.listPayments(branchId, { from: fromDate, to: toDate });
      setRows(data);
    } finally {
      setIsLoading(false);
    }
  };

  const totalAmount = rows?.reduce((sum, r) => sum + r.amount, 0) ?? 0;

  const handleExport = () => {
    if (!rows) return;
    const csv = toCsv(rows, [
      { header: "Receipt #", value: (r) => r.receipt_number ?? "" },
      { header: "Student", value: (r) => r.student_name },
      { header: "Fee Structure", value: (r) => r.fee_structure_name },
      { header: "Amount", value: (r) => r.amount },
      { header: "Method", value: (r) => r.payment_method },
      { header: "Date", value: (r) => formatDate(r.payment_date) },
    ]);
    downloadCsv(`fees-report-${fromDate}-to-${toDate}.csv`, csv);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4" data-no-print>
        <div className="flex flex-col gap-1.5">
          <Label>Paid from</Label>
          <Input type="date" className="w-40" max={todayIso()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Paid to</Label>
          <Input type="date" className="w-40" max={todayIso()} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <Button onClick={handleGenerate} disabled={isLoading}>
          {isLoading ? "Generating..." : "Generate report"}
        </Button>
        {rows && rows.length > 0 && (
          <>
            <Button variant="outline" onClick={handleExport}>
              <DownloadIcon />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <PrinterIcon />
              Print
            </Button>
          </>
        )}
      </div>

      {rows && (
        <>
          <div className="rounded-lg border" data-no-print>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Fee Structure</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.receipt_number ?? "—"}</TableCell>
                    <TableCell className="font-medium">
                      <PersonLink type="student" id={r.student_id} name={r.student_name} />
                    </TableCell>
                    <TableCell>{r.fee_structure_name}</TableCell>
                    <TableCell>₹{r.amount.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="capitalize">{r.payment_method.replace("_", " ")}</TableCell>
                    <TableCell>{formatDate(r.payment_date)}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No payments for this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {rows.length > 0 && (
            <p className="text-sm text-muted-foreground" data-no-print>
              Total collected: ₹{totalAmount.toLocaleString("en-IN")} across {rows.length} payment(s).
            </p>
          )}
        </>
      )}

      {rows && rows.length > 0 && (
        <ReportPrintTable
          branch={branch}
          template={template}
          paperColor={paperColor}
          documentTitle="Fee Collection Report"
          accent="var(--color-finance)"
          range={`Paid ${fromDate} to ${toDate}`}
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Receipt #", value: (r) => r.receipt_number ?? "—" },
            { header: "Student", value: (r) => r.student_name },
            { header: "Fee Structure", value: (r) => r.fee_structure_name },
            { header: "Amount", value: (r) => `₹${r.amount.toLocaleString("en-IN")}` },
            { header: "Method", value: (r) => r.payment_method.replace("_", " ") },
            { header: "Date", value: (r) => formatDate(r.payment_date) },
          ]}
        />
      )}
    </div>
  );
}
