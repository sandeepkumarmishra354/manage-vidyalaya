import type { Branch } from "@/lib/api";
import { cn } from "@/lib/utils";

// Shared template system for every printed document (fee receipt, payslip,
// attendance register, report card). One branch-level choice (Branch.print_template)
// applies to all four -- PrintLetterhead/SignatureBlock/PrintFrame all branch
// on the same `template` value, mirroring the id-card-templates.tsx pattern
// already established in this codebase.
export type PrintTemplate = "classic" | "bordered" | "tricolor" | "emblem" | "compact";

export const PRINT_TEMPLATES: { value: PrintTemplate; label: string; description: string }[] = [
  { value: "classic", label: "Classic", description: "Clean, minimal-ink header with a subtle accent rule" },
  { value: "bordered", label: "Formal Bordered", description: "Certificate-style double-rule border, centered emblem" },
  { value: "tricolor", label: "Tricolor Band", description: "Saffron-white-green band, centered branding" },
  { value: "emblem", label: "Emblem Watermark", description: "Bold header bar, faint logo watermark, sealed signature" },
  { value: "compact", label: "Compact Ledger", description: "Dense, paper-saving layout for high-volume receipts" },
];

// Wraps a print surface's whole document body: the "bordered" template gets
// a certificate-style double-rule frame (CSS border-style: double, which
// natively renders as two parallel rules with a gap at this width -- no
// extra markup needed), and the "emblem" template gets a large, faint
// watermark of the school's logo positioned behind the content. Both need
// to wrap the *entire* document (header + body + signature), not just the
// header, so this lives at the data-print-area level rather than inside
// PrintLetterhead itself.
export function PrintFrame({
  template,
  branch,
  children,
}: {
  template: PrintTemplate;
  branch?: Branch;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative", template === "bordered" && "border-8 border-double border-slate-700 p-8")}>
      {template === "emblem" && branch?.logo_url && (
        <img
          src={branch.logo_url}
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.07]"
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
