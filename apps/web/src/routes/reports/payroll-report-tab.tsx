import { useState } from "react";
import { DownloadIcon, PrinterIcon } from "lucide-react";

import { api, type Branch, type PayrollReportRow } from "@/lib/api";
import { downloadCsv, toCsv } from "@/lib/csv";
import { PersonLink } from "@/components/person-link";
import type { PrintPaperColor, PrintTemplate } from "@/components/print-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportPrintTable } from "./report-print-table";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function periodLabel(month: number, year: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function firstOfYearIso() {
  return `${new Date().getFullYear()}-01-01`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function PayrollReportTab({
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
  const [fromDate, setFromDate] = useState(firstOfYearIso());
  const [toDate, setToDate] = useState(todayIso());
  const [rows, setRows] = useState<PayrollReportRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const data = await api.getPayrollReport(branchId, fromDate, toDate);
      setRows(data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!rows) return;
    const csv = toCsv(rows, [
      { header: "Period", value: (r) => periodLabel(r.period_month, r.period_year) },
      { header: "Staff", value: (r) => `${r.first_name} ${r.last_name ?? ""}`.trim() },
      { header: "Gross Earnings", value: (r) => r.gross_earnings },
      { header: "Total Deductions", value: (r) => r.total_deductions },
      { header: "Net Pay", value: (r) => r.net_pay },
      { header: "Payslip Status", value: (r) => r.payslip_status },
    ]);
    downloadCsv(`payroll-report-${fromDate}-to-${toDate}.csv`, csv);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4" data-no-print>
        <div className="flex flex-col gap-1.5">
          <Label>Period from</Label>
          <Input type="date" className="w-40" max={todayIso()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Period to</Label>
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
        <div className="rounded-lg border" data-no-print>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Gross Earnings</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead>Net Pay</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.staff_id}-${r.period_year}-${r.period_month}-${i}`}>
                  <TableCell>{periodLabel(r.period_month, r.period_year)}</TableCell>
                  <TableCell className="font-medium">
                    <PersonLink type="staff" id={r.staff_id} name={`${r.first_name} ${r.last_name ?? ""}`} />
                  </TableCell>
                  <TableCell>₹{r.gross_earnings.toLocaleString("en-IN")}</TableCell>
                  <TableCell>₹{r.total_deductions.toLocaleString("en-IN")}</TableCell>
                  <TableCell>₹{r.net_pay.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="capitalize">{r.payslip_status}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No payroll data for this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {rows && rows.length > 0 && (
        <ReportPrintTable
          branch={branch}
          template={template}
          paperColor={paperColor}
          documentTitle="Payroll Report"
          accent="var(--color-finance)"
          range={`Period ${fromDate} to ${toDate}`}
          rows={rows}
          rowKey={(r) => `${r.staff_id}-${r.period_year}-${r.period_month}`}
          columns={[
            { header: "Period", value: (r) => periodLabel(r.period_month, r.period_year) },
            { header: "Staff", value: (r) => `${r.first_name} ${r.last_name ?? ""}` },
            { header: "Gross", value: (r) => `₹${r.gross_earnings.toLocaleString("en-IN")}` },
            { header: "Deductions", value: (r) => `₹${r.total_deductions.toLocaleString("en-IN")}` },
            { header: "Net Pay", value: (r) => `₹${r.net_pay.toLocaleString("en-IN")}` },
            { header: "Status", value: (r) => r.payslip_status },
          ]}
        />
      )}
    </div>
  );
}
