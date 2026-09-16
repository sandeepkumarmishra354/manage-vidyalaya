// TEMPORARY dev-only preview page for reviewing the 5 print templates
// side by side before wiring persistence/permissions. Not linked from any
// nav, not permission-gated (mock data only, nothing real). Delete once the
// real School Details picker + all 4 print surfaces are wired up.
import type { Branch } from "@/lib/api";
import { PrintLetterhead } from "@/components/print-letterhead";
import { PrintFrame, PRINT_TEMPLATES } from "@/components/print-templates";
import { SignatureBlock } from "@/components/signature-block";

const LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='32' cy='32' r='30' fill='%23164e9b'/><text x='32' y='42' font-size='30' text-anchor='middle' fill='white' font-family='serif' font-weight='bold'>V</text></svg>",
  );

const SIGNATURE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 60'><path d='M10 40 Q30 10 50 35 T90 30 Q110 5 130 35 T190 25' stroke='%231a1a2e' stroke-width='3' fill='none' stroke-linecap='round'/></svg>",
  );

const mockBranch: Branch = {
  id: "mock",
  tenant_id: "mock",
  name: "St. Xavier's Public School",
  code: "SXPS",
  address: "42 Gandhi Road, Andheri West",
  city: "Mumbai",
  state: "Maharashtra",
  pincode: "400058",
  phone: "+91 22 4567 8901",
  email: "office@stxaviers.edu.in",
  logo_url: LOGO,
  signature_url: SIGNATURE,
  is_active: true,
};

function MockReceiptBody() {
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-y-2 text-sm">
        <p className="text-slate-600">Student</p>
        <p className="font-medium">Aarav Sharma</p>
        <p className="text-slate-600">Class</p>
        <p className="font-medium">8 - B</p>
        <p className="text-slate-600">Roll number</p>
        <p className="font-medium">23</p>
        <p className="text-slate-600">Date of birth</p>
        <p className="font-medium">12 Apr 2013</p>
        <p className="text-slate-600">Guardian</p>
        <p className="font-medium">Rakesh Sharma</p>
        <p className="text-slate-600">Payment method</p>
        <p className="font-medium">Cash</p>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2">
            <th className="py-1.5 text-left">Fee</th>
            <th className="py-1.5 text-right">Amount due</th>
            <th className="py-1.5 text-right">This payment</th>
            <th className="py-1.5 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-1.5">Tuition Fee (Quarterly)</td>
            <td className="py-1.5 text-right">₹18,000.00</td>
            <td className="py-1.5 text-right">₹18,000.00</td>
            <td className="py-1.5 text-right">₹0.00</td>
          </tr>
          <tr className="border-b">
            <td className="py-1.5">Transport Fee</td>
            <td className="py-1.5 text-right">₹4,500.00</td>
            <td className="py-1.5 text-right">₹4,500.00</td>
            <td className="py-1.5 text-right">₹0.00</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

const ACCENTS: Record<string, string> = {
  classic: "var(--color-primary)",
  bordered: "var(--color-primary)",
  tricolor: "var(--color-primary)",
  emblem: "var(--color-finance)",
  compact: "var(--color-primary)",
};

// Report card accent uses the exams module color for the emblem template,
// matching how it'll actually be wired into report-card-viewer.tsx.
const REPORT_CARD_ACCENTS: Record<string, string> = { ...ACCENTS, emblem: "var(--color-exams)" };

const MOCK_ROWS = [
  { subject: "English", max: 100, obtained: 88, result: "pass" },
  { subject: "Mathematics", max: 100, obtained: 92, result: "pass" },
  { subject: "Science", max: 100, obtained: 79, result: "pass" },
  { subject: "Social Science", max: 100, obtained: 84, result: "pass" },
  { subject: "Hindi", max: 100, obtained: 90, result: "pass" },
  { subject: "Computer Science", max: 50, obtained: 47, result: "pass" },
];
const TOTAL_MAX = MOCK_ROWS.reduce((sum, r) => sum + r.max, 0);
const TOTAL_OBTAINED = MOCK_ROWS.reduce((sum, r) => sum + r.obtained, 0);
const PERCENTAGE = (TOTAL_OBTAINED / TOTAL_MAX) * 100;

function MockReportCardBody() {
  return (
    <>
      <div className="mb-6 flex items-start justify-between">
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <p className="col-span-2 text-lg font-semibold">Aarav Sharma</p>
          <p className="text-slate-600">
            Class <span className="font-medium text-slate-900">8 - B</span>
          </p>
          <p className="text-slate-600">
            Roll number <span className="font-medium text-slate-900">23</span>
          </p>
          <p className="text-slate-600">
            Date of birth <span className="font-medium text-slate-900">12 Apr 2013</span>
          </p>
          <p className="text-slate-600">
            Guardian <span className="font-medium text-slate-900">Rakesh Sharma</span>
          </p>
        </div>
        <p className="font-medium">Overall: Pass</p>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2">
            <th className="py-2 text-left">Subject</th>
            <th className="py-2 text-right">Max Marks</th>
            <th className="py-2 text-right">Obtained</th>
            <th className="py-2 text-right">Result</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_ROWS.map((row) => (
            <tr key={row.subject} className="border-b">
              <td className="py-2">{row.subject}</td>
              <td className="py-2 text-right">{row.max}</td>
              <td className="py-2 text-right">{row.obtained}</td>
              <td className="py-2 text-right capitalize">{row.result}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td className="py-2">Total</td>
            <td className="py-2 text-right">{TOTAL_MAX}</td>
            <td className="py-2 text-right" colSpan={2}>
              {TOTAL_OBTAINED} ({PERCENTAGE.toFixed(1)}%)
            </td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

export function DevPrintPreview() {
  const doc = new URLSearchParams(window.location.search).get("doc") === "reportcard" ? "reportcard" : "receipt";

  return (
    <div className="flex flex-col gap-10 bg-slate-100 p-10">
      {PRINT_TEMPLATES.map((t) => (
        <div key={t.value} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-bold">{t.label}</h2>
            <span className="text-sm text-muted-foreground">{t.description}</span>
          </div>
          <div className="mx-auto w-[210mm] bg-white p-8 shadow-lg">
            {doc === "receipt" ? (
              <PrintFrame template={t.value} branch={mockBranch}>
                <PrintLetterhead
                  branch={mockBranch}
                  documentTitle="Payment Receipt"
                  template={t.value}
                  accent={ACCENTS[t.value]}
                  right={
                    <>
                      <p>Receipt #FR-2026-00142</p>
                      <p>Date: 16 Sep 2026</p>
                    </>
                  }
                />
                <MockReceiptBody />
                <div className="mt-16 flex justify-end">
                  <SignatureBlock branch={mockBranch} template={t.value} accent={ACCENTS[t.value]} />
                </div>
              </PrintFrame>
            ) : (
              <PrintFrame template={t.value} branch={mockBranch}>
                <PrintLetterhead
                  branch={mockBranch}
                  documentTitle="Report Card"
                  template={t.value}
                  accent={REPORT_CARD_ACCENTS[t.value]}
                  right={<p className="font-medium">Half-Yearly Examination 2026</p>}
                />
                <MockReportCardBody />
                <div className="mt-16 flex items-center justify-between text-sm text-slate-600">
                  <div className="border-t border-slate-400 pt-1">Class Teacher</div>
                  <SignatureBlock
                    branch={mockBranch}
                    label="Principal"
                    template={t.value}
                    accent={REPORT_CARD_ACCENTS[t.value]}
                  />
                </div>
              </PrintFrame>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
