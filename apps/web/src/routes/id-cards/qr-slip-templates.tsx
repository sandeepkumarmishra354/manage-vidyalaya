import { QRCodeSVG } from "qrcode.react";

import type { StudentListItem } from "@/lib/api";

// A denser "print sheet" layout than the ID cards -- several slips per
// page, just enough identity to confirm a match at the scanner (name,
// admission no., class) plus a large scannable QR. Deliberately not
// PrintFrame/PrintLetterhead: a slip sheet isn't a letterhead document.
export function QrSlipPreview({ student, token }: { student: StudentListItem; token: string }) {
  const name = `${student.first_name} ${student.last_name ?? ""}`.trim();
  const classLine = [student.class_name, student.section_name].filter(Boolean).join(" - ") || "—";

  return (
    <div className="flex w-[65mm] flex-col items-center gap-2 rounded-lg border p-3 text-center text-slate-900">
      <QRCodeSVG value={token} size={120} className="rounded-sm bg-white p-1" />
      <p className="text-sm font-bold">{name}</p>
      <p className="text-xs text-slate-500">{classLine}</p>
      <p className="text-[10px] text-slate-400">Adm. No. {student.admission_number ?? "—"}</p>
    </div>
  );
}
