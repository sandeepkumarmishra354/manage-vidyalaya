import { useState } from "react";
import { DownloadIcon, PrinterIcon } from "lucide-react";

import { api, type Branch, type StudentListItem } from "@/lib/api";
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

export function StudentsReportTab({
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
  const [rows, setRows] = useState<StudentListItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const data = await api.listStudents(branchId, { from_date: fromDate, to_date: toDate });
      setRows(data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!rows) return;
    const csv = toCsv(rows, [
      { header: "Admission Number", value: (r) => r.admission_number ?? "" },
      { header: "Name", value: (r) => `${r.first_name} ${r.last_name ?? ""}`.trim() },
      { header: "Class", value: (r) => r.class_name ?? "" },
      { header: "Section", value: (r) => r.section_name ?? "" },
      { header: "Status", value: (r) => r.status },
      { header: "Added On", value: (r) => formatDate(r.created_at) },
    ]);
    downloadCsv(`students-report-${fromDate}-to-${toDate}.csv`, csv);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4" data-no-print>
        <div className="flex flex-col gap-1.5">
          <Label>Added from</Label>
          <Input type="date" className="w-40" max={todayIso()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Added to</Label>
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
      <p className="text-xs text-muted-foreground" data-no-print>
        "Added" reflects when the student record was created, not necessarily the admission date.
      </p>

      {rows && (
        <div className="rounded-lg border" data-no-print>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admission #</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.admission_number ?? "—"}</TableCell>
                  <TableCell className="font-medium">
                    <PersonLink type="student" id={r.id} name={`${r.first_name} ${r.last_name ?? ""}`} />
                  </TableCell>
                  <TableCell>{r.class_name ?? "—"}</TableCell>
                  <TableCell>{r.section_name ?? "—"}</TableCell>
                  <TableCell className="capitalize">{r.status}</TableCell>
                  <TableCell>{formatDate(r.created_at)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No students for this range.
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
          documentTitle="Students Report"
          accent="var(--color-academics)"
          range={`Added ${fromDate} to ${toDate}`}
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Admission #", value: (r) => r.admission_number ?? "—" },
            { header: "Name", value: (r) => `${r.first_name} ${r.last_name ?? ""}` },
            { header: "Class", value: (r) => r.class_name ?? "—" },
            { header: "Section", value: (r) => r.section_name ?? "—" },
            { header: "Status", value: (r) => r.status },
          ]}
        />
      )}
    </div>
  );
}
