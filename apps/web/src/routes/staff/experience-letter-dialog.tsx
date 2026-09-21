import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileTextIcon, PrinterIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type ExperienceLetter } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { PrintLetterhead } from "@/components/print-letterhead";
import { PrintFrame, type PrintPaperColor, type PrintTemplate } from "@/components/print-templates";
import { SignatureBlock } from "@/components/signature-block";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function IssueForm({ staffId, onIssued }: { staffId: string; onIssued: (letter: ExperienceLetter) => void }) {
  const [reason, setReason] = useState("");
  const [dateOfLeaving, setDateOfLeaving] = useState("");
  const [conductRemark, setConductRemark] = useState("Good");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const letter = await api.issueExperienceLetter(staffId, {
        reason_for_leaving: reason,
        date_of_leaving: dateOfLeaving,
        conduct_remark: conductRemark || null,
      });
      onIssued(letter);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exp-date-of-leaving">Date of leaving</Label>
        <Input id="exp-date-of-leaving" type="date" value={dateOfLeaving} onChange={(e) => setDateOfLeaving(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exp-reason">Reason for leaving</Label>
        <Input id="exp-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Resigned to pursue other opportunities" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exp-conduct">Conduct remark</Label>
        <Textarea id="exp-conduct" value={conductRemark} onChange={(e) => setConductRemark(e.target.value)} rows={2} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Generating..." : "Generate Experience Letter"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function LetterFieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b py-1.5 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function LetterPrintView({ letter }: { letter: ExperienceLetter }) {
  const branches = useAppStore((s) => s.branches);
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const branch = branches.find((b) => b.id === selectedBranchId);
  const template = (branch?.print_template as PrintTemplate) || "classic";
  const paperColor = (branch?.print_paper_color as PrintPaperColor) || "white";

  const [principalSignatureUrl, setPrincipalSignatureUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (branch?.id) {
      api.getPrincipalSignature(branch.id).then((r) => setPrincipalSignatureUrl(r.signature_url));
    }
  }, [branch?.id]);

  return (
    <>
      <div data-no-print className="flex justify-end">
        <Button variant="outline" onClick={() => window.print()}>
          <PrinterIcon />
          Print
        </Button>
      </div>

      {/* Portaled to <body> -- see the matching comment in payment-receipt.tsx
          for why: DialogContent is a `display: grid` container, which is
          always the containing block for its own absolutely-positioned
          children regardless of `position`, so [data-print-area] can't
          reliably escape it with CSS resets alone. */}
      {createPortal(
        <div data-print-area className="hidden print:block">
          <PrintFrame template={template} paperColor={paperColor} branch={branch}>
            <PrintLetterhead
              branch={branch}
              documentTitle="Experience Letter"
              template={template}
              right={
                <>
                  {letter.experience_letter_number && <p>Letter #{letter.experience_letter_number}</p>}
                  {letter.experience_letter_issue_date && <p>Date: {formatDate(letter.experience_letter_issue_date)}</p>}
                </>
              }
            />
            <div className="mb-4">
              <LetterFieldRow label="Employee code" value={letter.employee_code} />
              <LetterFieldRow label="Name" value={[letter.first_name, letter.last_name].filter(Boolean).join(" ")} />
              <LetterFieldRow label="Designation" value={letter.designation} />
              <LetterFieldRow label="Department" value={letter.department ?? "—"} />
              <LetterFieldRow label="Date of joining" value={formatDate(letter.date_of_joining)} />
              <LetterFieldRow label="Date of leaving" value={letter.date_of_leaving ? formatDate(letter.date_of_leaving) : "—"} />
              <LetterFieldRow label="Reason for leaving" value={letter.reason_for_leaving ?? "—"} />
              <LetterFieldRow label="Conduct" value={letter.conduct_remark ?? "—"} />
            </div>
            <div className="mt-16 flex justify-end">
              <SignatureBlock branch={branch} signatureUrl={principalSignatureUrl} template={template} />
            </div>
          </PrintFrame>
        </div>,
        document.body,
      )}
    </>
  );
}

export function ExperienceLetterDialog({ staffId }: { staffId: string }) {
  const [open, setOpen] = useState(false);
  const [letter, setLetter] = useState<ExperienceLetter | null>(null);

  useEffect(() => {
    if (open) {
      api.getExperienceLetter(staffId).then(setLetter);
    } else {
      setLetter(null);
    }
  }, [open, staffId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileTextIcon />
          Experience Letter
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Experience Letter</DialogTitle>
        </DialogHeader>
        {letter === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : letter.experience_letter_number ? (
          <LetterPrintView letter={letter} />
        ) : (
          <IssueForm staffId={staffId} onIssued={setLetter} />
        )}
      </DialogContent>
    </Dialog>
  );
}
