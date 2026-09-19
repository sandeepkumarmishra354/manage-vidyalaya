import type { Branch } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import type { PrintTemplate } from "@/components/print-templates";

/**
 * Shared print-document header: school name/logo, address, contact info,
 * and a document title, with an optional right-aligned block (each caller's
 * own "Class: X / Date: Y" style summary). Used by every full-page print
 * view (attendance register, report card, payslip, fee receipt) so a
 * branch's identity shows up consistently everywhere it's printed. Renders
 * one of 5 templates (Branch.print_template, chosen in School Details) --
 * see print-templates.tsx for the full list and PrintFrame for the two
 * templates (bordered/emblem) that also wrap the rest of the document.
 */
export function PrintLetterhead({
  branch,
  documentTitle,
  right,
  template = "classic",
  accent = "var(--color-primary)",
}: {
  branch?: Branch;
  documentTitle: string;
  right?: React.ReactNode;
  template?: PrintTemplate;
  /** CSS color used for the emblem template's header bar and bordered template's tag -- pass a module accent (finance/staff/academics/exams) to match the document type. */
  accent?: string;
}) {
  const tenant = useAppStore((s) => s.tenant);
  const addressLine = [branch?.address, branch?.city, branch?.state, branch?.pincode].filter(Boolean).join(", ");
  const contactLine = [branch?.phone, branch?.email].filter(Boolean).join(" · ");
  const schoolName = branch?.name ?? "Vidyalaya School";

  if (template === "bordered") {
    return (
      <div className="relative mb-4 flex flex-col items-center border-b-4 border-double border-slate-700 pb-3 text-center">
        {right && (
          <div className="absolute top-0 right-0 rounded border border-slate-400 px-2 py-1 text-[10px] text-slate-600">
            {right}
          </div>
        )}
        {branch?.logo_url && <img src={branch.logo_url} alt="" className="h-16 w-16 object-contain" />}
        {tenant?.name && <p className="mt-2 text-[10px] font-medium tracking-widest text-slate-500 uppercase">{tenant.name}</p>}
        <p className="mt-1 font-serif text-2xl font-bold tracking-wide uppercase">{schoolName}</p>
        {addressLine && <p className="mt-1 text-xs text-slate-500">{addressLine}</p>}
        {contactLine && <p className="text-xs text-slate-500">{contactLine}</p>}
        <div className="mt-3 flex w-full items-center justify-center gap-3">
          <span className="h-px flex-1 bg-slate-400" />
          <span className="text-xs text-slate-400">❖</span>
          <span className="h-px flex-1 bg-slate-400" />
        </div>
        <p className="mt-2 text-sm font-semibold tracking-[0.2em] text-slate-700 uppercase">{documentTitle}</p>
      </div>
    );
  }

  if (template === "tricolor") {
    return (
      <div className="mb-4">
        <div className="mb-3 flex h-1.5 w-full overflow-hidden rounded-full">
          <div className="flex-1" style={{ backgroundColor: "#FF9933" }} />
          <div className="flex-1 border-y border-slate-200 bg-white" />
          <div className="flex-1" style={{ backgroundColor: "#138808" }} />
        </div>
        <div className="relative flex flex-col items-center text-center">
          {right && <div className="absolute top-0 right-0 text-[10px] text-slate-500">{right}</div>}
          {branch?.logo_url && <img src={branch.logo_url} alt="" className="h-12 w-12 object-contain" />}
          {tenant?.name && <p className="mt-1 text-[10px] font-medium tracking-wide text-slate-500 uppercase">{tenant.name}</p>}
          <p className="text-xl font-bold">{schoolName}</p>
          <p className="text-sm font-semibold text-slate-700">{documentTitle}</p>
          {addressLine && <p className="text-xs text-slate-500">{addressLine}</p>}
          {contactLine && <p className="text-xs text-slate-500">{contactLine}</p>}
        </div>
        <div className="mt-3 border-t border-dashed border-slate-300" />
      </div>
    );
  }

  if (template === "emblem") {
    return (
      <div className="mb-4 overflow-hidden rounded-t-md border">
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ backgroundColor: accent }}>
          <div className="flex items-center gap-3">
            {branch?.logo_url && (
              <div className="flex size-11 items-center justify-center rounded-full bg-white/20 p-1">
                <img src={branch.logo_url} alt="" className="h-full w-full object-contain" />
              </div>
            )}
            <div>
              <p className="text-lg font-bold">{schoolName}</p>
              <p className="text-xs text-white/85">{documentTitle}</p>
            </div>
          </div>
          {right && <div className="text-right text-xs text-white/90">{right}</div>}
        </div>
        {(addressLine || contactLine) && (
          <div className="bg-slate-50 px-4 py-2 text-xs text-slate-500">
            {addressLine}
            {addressLine && contactLine ? " · " : ""}
            {contactLine}
          </div>
        )}
      </div>
    );
  }

  if (template === "compact") {
    return (
      <div className="mb-3 flex items-center justify-between gap-3 border-b pb-2">
        <div className="flex items-center gap-2">
          {branch?.logo_url && <img src={branch.logo_url} alt="" className="h-8 w-8 object-contain" />}
          <div>
            <p className="text-sm leading-tight font-bold">
              {schoolName} <span className="font-normal text-slate-500">· {documentTitle}</span>
            </p>
            <p className="text-[10px] leading-tight text-slate-500">
              {addressLine}
              {addressLine && contactLine ? " · " : ""}
              {contactLine}
            </p>
          </div>
        </div>
        {right && <div className="text-right text-[10px] text-slate-600">{right}</div>}
      </div>
    );
  }

  // classic (refined default)
  return (
    <div className="mb-4 flex items-center justify-between border-b-2 pb-3" style={{ borderColor: accent }}>
      <div className="flex items-center gap-3">
        {branch?.logo_url && <img src={branch.logo_url} alt="" className="h-12 w-12 object-contain" />}
        <div>
          {tenant?.name && <p className="text-xs font-medium text-slate-500 uppercase">School: {tenant.name}</p>}
          <p className="text-2xl font-bold tracking-tight">{schoolName}</p>
          <p className="text-sm font-medium" style={{ color: accent }}>
            {documentTitle}
          </p>
          {addressLine && <p className="text-xs text-slate-500">{addressLine}</p>}
          {contactLine && <p className="text-xs text-slate-500">{contactLine}</p>}
        </div>
      </div>
      {right && <div className="text-right text-sm text-slate-600">{right}</div>}
    </div>
  );
}
