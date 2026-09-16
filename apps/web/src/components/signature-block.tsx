import type { Branch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PrintTemplate } from "@/components/print-templates";

/**
 * Shared print-document signature line: renders the branch's uploaded
 * signature image (School Details -> signature upload) above a bordered
 * label, or just the blank bordered line if no signature has been uploaded
 * yet. Used by every print surface that needs an "authorized signatory"
 * line (payslip, fee receipt, attendance register, report card) so a
 * signature image propagates to all of them from one upload. Renders one
 * of the same 5 templates as PrintLetterhead (see print-templates.tsx).
 */
export function SignatureBlock({
  branch,
  signatureUrl,
  label = "Authorized signatory",
  template = "classic",
  accent = "var(--color-primary)",
  className,
}: {
  branch?: Branch;
  /** A specific person's signature (class teacher, principal) -- takes
   * precedence over branch.signature_url when provided. Omit while still
   * resolving one asynchronously so the branch signature shows in the
   * meantime rather than nothing. */
  signatureUrl?: string | null;
  label?: string;
  template?: PrintTemplate;
  accent?: string;
  className?: string;
}) {
  const resolvedUrl = signatureUrl ?? branch?.signature_url;

  if (template === "bordered") {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-1 rounded border border-slate-400 px-6 py-2 text-center text-xs",
          className,
        )}
      >
        {resolvedUrl ? (
          <img src={resolvedUrl} alt="" className="h-12 object-contain" />
        ) : (
          <div className="h-12" />
        )}
        <div className="w-40 border-t border-slate-400 pt-1 font-serif">{label}</div>
      </div>
    );
  }

  if (template === "emblem") {
    return (
      <div className={cn("flex flex-col items-center gap-1 text-center text-xs", className)}>
        <div
          className="flex size-16 items-center justify-center rounded-full border-2 border-dashed p-1"
          style={{ borderColor: accent }}
        >
          {resolvedUrl && <img src={resolvedUrl} alt="" className="h-full w-full object-contain" />}
        </div>
        <div className="w-40 border-t pt-1 text-slate-600">{label}</div>
      </div>
    );
  }

  if (template === "compact") {
    return (
      <div className={cn("flex flex-col items-center gap-0.5 text-center text-[10px] text-slate-600", className)}>
        {resolvedUrl && <img src={resolvedUrl} alt="" className="h-8 object-contain" />}
        <div className="w-28 border-t pt-0.5">{label}</div>
      </div>
    );
  }

  // classic / tricolor (plain line)
  return (
    <div className={cn("flex flex-col items-center gap-1 text-center text-xs text-slate-600", className)}>
      {resolvedUrl && <img src={resolvedUrl} alt="" className="h-12 object-contain" />}
      <div className="w-40 border-t pt-1">{label}</div>
    </div>
  );
}
