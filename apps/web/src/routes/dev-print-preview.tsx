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
        <p className="font-medium">Aarav Sharma (Class 8 - B)</p>
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

export function DevPrintPreview() {
  return (
    <div className="flex flex-col gap-10 bg-slate-100 p-10">
      {PRINT_TEMPLATES.map((t) => (
        <div key={t.value} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-bold">{t.label}</h2>
            <span className="text-sm text-muted-foreground">{t.description}</span>
          </div>
          <div className="mx-auto w-[210mm] bg-white p-8 shadow-lg">
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
          </div>
        </div>
      ))}
    </div>
  );
}
