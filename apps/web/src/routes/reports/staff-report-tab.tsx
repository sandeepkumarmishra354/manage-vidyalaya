import { useState } from "react";
import { DownloadIcon, PrinterIcon } from "lucide-react";

import { api, type Branch, type StaffListItem } from "@/lib/api";
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

export function StaffReportTab({
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
  const [rows, setRows] = useState<StaffListItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const data = await api.listStaff(branchId, undefined, { from_date: fromDate, to_date: toDate });
      setRows(data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!rows) return;
    const csv = toCsv(rows, [
      { header: "Employee Code", value: (r) => r.employee_code },
      { header: "Name", value: (r) => `${r.first_name} ${r.last_name ?? ""}`.trim() },
      { header: "Designation", value: (r) => r.designation },
      { header: "Department", value: (r) => r.department ?? "" },
      { header: "Status", value: (r) => r.status },
      { header: "Joined On", value: (r) => formatDate(r.date_of_joining) },
    ]);
    downloadCsv(`staff-report-${fromDate}-to-${toDate}.csv`, csv);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4" data-no-print>
        <div className="flex flex-col gap-1.5">
          <Label>Joined from</Label>
          <Input type="date" className="w-40" max={todayIso()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Joined to</Label>
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
                <TableHead>Employee Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.employee_code}</TableCell>
                  <TableCell className="font-medium">
                    <PersonLink type="staff" id={r.id} name={`${r.first_name} ${r.last_name ?? ""}`} />
                  </TableCell>
                  <TableCell>{r.designation}</TableCell>
                  <TableCell>{r.department ?? "—"}</TableCell>
                  <TableCell className="capitalize">{r.status}</TableCell>
                  <TableCell>{formatDate(r.date_of_joining)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No staff for this range.
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
          documentTitle="Staff Report"
          accent="var(--color-staff)"
          range={`Joined ${fromDate} to ${toDate}`}
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Employee Code", value: (r) => r.employee_code },
            { header: "Name", value: (r) => `${r.first_name} ${r.last_name ?? ""}` },
            { header: "Designation", value: (r) => r.designation },
            { header: "Department", value: (r) => r.department ?? "—" },
            { header: "Status", value: (r) => r.status },
          ]}
        />
      )}
    </div>
  );
}
