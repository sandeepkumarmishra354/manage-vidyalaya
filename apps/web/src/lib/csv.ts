// Client-side CSV generation for on-screen report tables (e.g. attendance
// report export) -- no backend CSV endpoint needed, the data is already
// fetched as JSON for the on-screen table.
export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => string | number }[]): string {
  const escape = (cell: string | number) => {
    const s = String(cell);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => escape(c.value(row))).join(","));
  return [header, ...body].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
