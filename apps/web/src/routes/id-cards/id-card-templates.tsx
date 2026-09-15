import { GraduationCapIcon } from "lucide-react";

import type { Branch, StudentListItem } from "@/lib/api";

export type IdCardTemplate = "classic" | "modern" | "minimal" | "compact";

export const ID_CARD_TEMPLATES: { value: IdCardTemplate; label: string; description: string }[] = [
  { value: "classic", label: "Classic", description: "Portrait card, colored header, photo left" },
  { value: "modern", label: "Modern", description: "Bold gradient block, portrait" },
  { value: "minimal", label: "Minimal", description: "Clean white card, thin border" },
  { value: "compact", label: "Compact", description: "Landscape layout, photo right" },
];

const CARD_SIZE = { width: "54mm", height: "85.6mm" }; // portrait CR80
const CARD_SIZE_LANDSCAPE = { width: "85.6mm", height: "54mm" };

function initials(first: string, last?: string | null) {
  return `${first[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

function PhotoPlaceholder({ initialsText, className }: { initialsText: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-md bg-white/25 font-bold text-white backdrop-blur-sm ${className ?? ""}`}
    >
      {initialsText}
    </div>
  );
}

export function IdCardPreview({
  template,
  student,
  branch,
  className: extraClassName,
  validTill,
}: {
  template: IdCardTemplate;
  student: StudentListItem;
  branch: Branch | undefined;
  className?: string;
  validTill?: string | null;
}) {
  const name = `${student.first_name} ${student.last_name ?? ""}`.trim();
  const initialsText = initials(student.first_name, student.last_name);
  const classLine = [student.class_name, student.section_name].filter(Boolean).join(" - ") || "—";

  if (template === "classic") {
    return (
      <div
        style={CARD_SIZE}
        className={`flex flex-col overflow-hidden rounded-xl border bg-white text-slate-900 shadow-md ${extraClassName ?? ""}`}
      >
        <div className="brand-gradient flex items-center gap-1.5 px-3 py-2 text-white">
          <GraduationCapIcon className="size-4" />
          <p className="text-[9px] font-bold tracking-wide uppercase">{branch?.name ?? "Vidyalaya School"}</p>
        </div>
        <div className="flex flex-1 flex-col items-center gap-2 px-3 py-3">
          <PhotoPlaceholder initialsText={initialsText} className="brand-gradient size-16 text-xl" />
          <p className="text-center text-sm font-bold">{name}</p>
          <div className="w-full space-y-1 text-[10px]">
            <Row label="Class" value={classLine} />
            <Row label="Admission No." value={student.admission_number ?? "—"} />
          </div>
        </div>
        <div className="border-t bg-slate-50 px-3 py-1.5 text-center text-[8px] text-slate-500">
          Valid till {validTill ?? "—"}
        </div>
      </div>
    );
  }

  if (template === "modern") {
    return (
      <div
        style={CARD_SIZE}
        className={`brand-gradient relative flex flex-col overflow-hidden rounded-xl text-white shadow-md ${extraClassName ?? ""}`}
      >
        <div className="absolute -top-8 -right-10 size-32 rounded-full bg-white/10" />
        <div className="absolute -bottom-10 -left-8 size-28 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-1.5 px-3 py-2.5">
          <GraduationCapIcon className="size-4" />
          <p className="text-[9px] font-bold tracking-wide uppercase">{branch?.name ?? "Vidyalaya School"}</p>
        </div>
        <div className="relative flex flex-1 flex-col items-center justify-center gap-2 px-3">
          <PhotoPlaceholder initialsText={initialsText} className="size-16 border-2 border-white/60 text-xl" />
          <p className="text-center text-sm font-bold">{name}</p>
          <p className="text-[10px] text-white/85">{classLine}</p>
        </div>
        <div className="relative border-t border-white/20 px-3 py-1.5 text-center text-[8px] text-white/80">
          Adm. No. {student.admission_number ?? "—"} · Valid till {validTill ?? "—"}
        </div>
      </div>
    );
  }

  if (template === "minimal") {
    return (
      <div
        style={CARD_SIZE}
        className={`flex flex-col overflow-hidden rounded-lg border-2 border-slate-200 bg-white text-slate-900 ${extraClassName ?? ""}`}
      >
        <div className="flex items-center gap-1.5 px-3 pt-3">
          <GraduationCapIcon className="size-3.5 text-primary" />
          <p className="text-[8px] font-semibold tracking-wide text-slate-500 uppercase">
            {branch?.name ?? "Vidyalaya School"}
          </p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3">
          <div className="flex size-16 items-center justify-center rounded-full border-2 border-primary/30 text-lg font-bold text-primary">
            {initialsText}
          </div>
          <p className="text-center text-sm font-bold">{name}</p>
          <p className="text-[10px] text-slate-500">{classLine}</p>
        </div>
        <div className="flex items-center justify-between border-t px-3 py-1.5 text-[8px] text-slate-500">
          <span>{student.admission_number ?? "—"}</span>
          <span>Till {validTill ?? "—"}</span>
        </div>
      </div>
    );
  }

  // compact / landscape
  return (
    <div
      style={CARD_SIZE_LANDSCAPE}
      className={`flex overflow-hidden rounded-xl border bg-white text-slate-900 shadow-md ${extraClassName ?? ""}`}
    >
      <div className="flex flex-1 flex-col justify-between p-3">
        <div className="flex items-center gap-1.5">
          <GraduationCapIcon className="size-3.5 text-primary" />
          <p className="text-[8px] font-semibold tracking-wide text-slate-500 uppercase">
            {branch?.name ?? "Vidyalaya School"}
          </p>
        </div>
        <div>
          <p className="text-sm font-bold">{name}</p>
          <p className="text-[10px] text-slate-500">{classLine}</p>
        </div>
        <div className="text-[8px] text-slate-500">
          <p>Adm. No. {student.admission_number ?? "—"}</p>
          <p>Valid till {validTill ?? "—"}</p>
        </div>
      </div>
      <div className="brand-gradient flex w-20 shrink-0 items-center justify-center">
        <PhotoPlaceholder initialsText={initialsText} className="size-14 text-lg" />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-dashed pb-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
