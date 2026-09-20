import type { Branch } from "@/lib/api";
import { PrintLetterhead } from "@/components/print-letterhead";
import { PrintFrame, type PrintPaperColor, type PrintTemplate } from "@/components/print-templates";

// Shared print layout for every Reports tab: letterhead + a plain table,
// no signature block (a report isn't a signed document). Follows the same
// data-print-area/hidden print:block pattern used by attendance-page.tsx's
// register print, kept as one component since all four report tabs need
// the identical shape.
export function ReportPrintTable<T>({
  branch,
  template,
  paperColor,
  documentTitle,
  accent,
  range,
  columns,
  rows,
  rowKey,
}: {
  branch?: Branch;
  template: PrintTemplate;
  paperColor: PrintPaperColor;
  documentTitle: string;
  accent: string;
  range: string;
  columns: { header: string; value: (row: T) => React.ReactNode }[];
  rows: T[];
  rowKey: (row: T) => string;
}) {
  return (
    <div data-print-area className="hidden print:block">
      <PrintFrame template={template} paperColor={paperColor} branch={branch}>
        <PrintLetterhead branch={branch} documentTitle={documentTitle} template={template} accent={accent} right={<p>{range}</p>} />
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2">
              {columns.map((c) => (
                <th key={c.header} className="py-1.5 text-left">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b">
                {columns.map((c) => (
                  <td key={c.header} className="py-1.5">
                    {c.value(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </PrintFrame>
    </div>
  );
}
