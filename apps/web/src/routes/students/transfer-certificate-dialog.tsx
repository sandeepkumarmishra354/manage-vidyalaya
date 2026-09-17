import { useEffect, useState } from "react";
import { FileTextIcon, PrinterIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type TransferCertificate } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { PrintLetterhead } from "@/components/print-letterhead";
import { PrintFrame, type PrintPaperColor, type PrintTemplate } from "@/components/print-templates";
import { SignatureBlock } from "@/components/signature-block";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function IssueForm({ studentId, onIssued }: { studentId: string; onIssued: (tc: TransferCertificate) => void }) {
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
      const tc = await api.issueTransferCertificate(studentId, {
        reason_for_leaving: reason,
        date_of_leaving: dateOfLeaving,
        conduct_remark: conductRemark || null,
      });
      onIssued(tc);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tc-date-of-leaving">Date of leaving</Label>
        <Input id="tc-date-of-leaving" type="date" value={dateOfLeaving} onChange={(e) => setDateOfLeaving(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tc-reason">Reason for leaving</Label>
        <Input id="tc-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family relocation" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tc-conduct">Conduct remark</Label>
        <Textarea id="tc-conduct" value={conductRemark} onChange={(e) => setConductRemark(e.target.value)} rows={2} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Generating..." : "Generate Transfer Certificate"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function TcFieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b py-1.5 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function TcPrintView({ tc }: { tc: TransferCertificate }) {
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

      <div data-print-area className="hidden print:block">
        <PrintFrame template={template} paperColor={paperColor} branch={branch}>
          <PrintLetterhead
            branch={branch}
            documentTitle="Transfer Certificate"
            template={template}
            right={
              <>
                {tc.tc_number && <p>TC #{tc.tc_number}</p>}
                {tc.tc_issue_date && <p>Date: {formatDate(tc.tc_issue_date)}</p>}
              </>
            }
          />
          <div className="mb-4">
            <TcFieldRow label="Admission number" value={tc.admission_number ?? "—"} />
            <TcFieldRow label="Student name" value={[tc.first_name, tc.last_name].filter(Boolean).join(" ")} />
            <TcFieldRow label="Date of birth" value={tc.date_of_birth ? formatDate(tc.date_of_birth) : "—"} />
            <TcFieldRow label="Class at leaving" value={[tc.class_name, tc.section_name].filter(Boolean).join(" - ") || "—"} />
            <TcFieldRow label="Date of admission" value={tc.date_of_admission ? formatDate(tc.date_of_admission) : "—"} />
            <TcFieldRow label="Date of leaving" value={tc.date_of_leaving ? formatDate(tc.date_of_leaving) : "—"} />
            <TcFieldRow label="Reason for leaving" value={tc.reason_for_leaving ?? "—"} />
            <TcFieldRow label="Conduct" value={tc.conduct_remark ?? "—"} />
          </div>
          <div className="mt-16 flex justify-end">
            <SignatureBlock branch={branch} signatureUrl={principalSignatureUrl} template={template} />
          </div>
        </PrintFrame>
      </div>
    </>
  );
}

export function TransferCertificateDialog({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [tc, setTc] = useState<TransferCertificate | null>(null);

  useEffect(() => {
    if (open) {
      api.getTransferCertificate(studentId).then(setTc);
    } else {
      setTc(null);
    }
  }, [open, studentId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileTextIcon />
          Transfer Certificate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transfer Certificate</DialogTitle>
        </DialogHeader>
        {tc === null ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : tc.tc_number ? (
          <TcPrintView tc={tc} />
        ) : (
          <IssueForm studentId={studentId} onIssued={setTc} />
        )}
      </DialogContent>
    </Dialog>
  );
}
