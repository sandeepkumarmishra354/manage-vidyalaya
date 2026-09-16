import type { Branch } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Shared print-document signature line: renders the branch's uploaded
 * signature image (School Details -> signature upload) above a bordered
 * label, or just the blank bordered line if no signature has been uploaded
 * yet. Used by every print surface that needs an "authorized signatory"
 * line (payslip, fee receipt, attendance register, report card) so a
 * signature image propagates to all of them from one upload.
 */
export function SignatureBlock({
  branch,
  label = "Authorized signatory",
  className,
}: {
  branch?: Branch;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-1 text-center text-xs text-slate-600", className)}>
      {branch?.signature_url && <img src={branch.signature_url} alt="" className="h-12 object-contain" />}
      <div className="w-40 border-t pt-1">{label}</div>
    </div>
  );
}
