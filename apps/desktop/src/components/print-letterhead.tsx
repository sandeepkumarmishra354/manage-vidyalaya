import type { Branch } from "@/lib/api";

/**
 * Shared print-document header: school name/logo, address, contact info,
 * and a document title, with an optional right-aligned block (each caller's
 * own "Class: X / Date: Y" style summary). Used by every full-page print
 * view (attendance register, report card, payslip, fee receipt) so a
 * branch's identity shows up consistently everywhere it's printed.
 */
export function PrintLetterhead({
  branch,
  documentTitle,
  right,
}: {
  branch?: Branch;
  documentTitle: string;
  right?: React.ReactNode;
}) {
  const addressLine = [branch?.address, branch?.city, branch?.state, branch?.pincode].filter(Boolean).join(", ");
  const contactLine = [branch?.phone, branch?.email].filter(Boolean).join(" · ");

  return (
    <div className="mb-6 flex items-center justify-between border-b-2 pb-4">
      <div className="flex items-center gap-3">
        {branch?.logo_url && <img src={branch.logo_url} alt="" className="h-12 w-12 object-contain" />}
        <div>
          <p className="text-xl font-bold">{branch?.name ?? "Vidyalaya School"}</p>
          <p className="text-sm text-slate-600">{documentTitle}</p>
          {addressLine && <p className="text-xs text-slate-500">{addressLine}</p>}
          {contactLine && <p className="text-xs text-slate-500">{contactLine}</p>}
        </div>
      </div>
      {right && <div className="text-right text-sm text-slate-600">{right}</div>}
    </div>
  );
}
