import { useEffect, useState } from "react";
import { SearchIcon } from "lucide-react";

import { api, type RetentionCategory, type RetentionPolicy } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CATEGORY_LABELS: Record<RetentionCategory, string> = {
  student_identity: "Student Identity",
  staff_identity: "Staff Identity",
  financial_records: "Financial Records (Payroll, Fees)",
  academic_records: "Academic Records (Exam Marks)",
};

const CATEGORY_DESCRIPTIONS: Record<RetentionCategory, string> = {
  student_identity: "Name, contact, address, and government-ID fields on a student and their guardian(s), once well past graduation/withdrawal.",
  staff_identity: "Name, contact, and address fields on a staff member, once well past their leaving date. Bank/PAN/PF details are never touched here.",
  financial_records: "Payroll and fee payment records. Not yet swept by any automated process -- confirm actual retention periods (Income Tax Act, Companies Act) with your CA first.",
  academic_records: "Exam marks and report cards. Not yet swept by any automated process -- confirm actual retention periods with your state education board first.",
};

// The actual anonymization sweep is a separate, ops-run script
// (scripts/run-retention.ts, dry-run by default) rather than a button
// here -- editing years and previewing counts is safe self-service, but
// triggering real, irreversible anonymization from a web request is a
// deliberately bigger step this page doesn't take.
export function RetentionPolicyPage() {
  const [policies, setPolicies] = useState<RetentionPolicy[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [previewCounts, setPreviewCounts] = useState<Record<string, number>>({});
  const [previewingCategory, setPreviewingCategory] = useState<string | null>(null);

  const refresh = () => {
    api.listRetentionPolicies().then((rows) => {
      setPolicies(rows);
      setDrafts(Object.fromEntries(rows.map((r) => [r.category, String(r.retention_years)])));
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = async (category: RetentionCategory) => {
    const years = Number(drafts[category]);
    if (!Number.isInteger(years) || years < 1) return;
    setSavingCategory(category);
    try {
      await api.updateRetentionPolicy(category, years);
      refresh();
    } finally {
      setSavingCategory(null);
    }
  };

  const handlePreview = async (category: RetentionCategory) => {
    setPreviewingCategory(category);
    try {
      const rows = await api.previewRetention();
      setPreviewCounts(Object.fromEntries(rows.map((r) => [r.category, r.eligible_count])));
    } finally {
      setPreviewingCategory(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Data Retention</h1>
        <p className="text-muted-foreground">
          DPDP retention policy per data category. Only Student Identity and Staff Identity are actively swept today; see each
          row's description for what "Dormant" means.
        </p>
      </div>

      {policies && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Retention (years)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Eligible now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((policy) => (
                <TableRow key={policy.category}>
                  <TableCell className="max-w-sm whitespace-normal">
                    <p className="font-medium">{CATEGORY_LABELS[policy.category]}</p>
                    <p className="text-xs text-muted-foreground">{CATEGORY_DESCRIPTIONS[policy.category]}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        className="w-20"
                        value={drafts[policy.category] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [policy.category]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingCategory === policy.category || drafts[policy.category] === String(policy.retention_years)}
                        onClick={() => handleSave(policy.category)}
                      >
                        {savingCategory === policy.category ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={policy.is_active ? "default" : "outline"}>{policy.is_active ? "Active" : "Dormant"}</Badge>
                  </TableCell>
                  <TableCell>
                    {policy.is_active ? (
                      previewCounts[policy.category] !== undefined ? (
                        <span className="text-sm">{previewCounts[policy.category]} record(s)</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={previewingCategory === policy.category}
                          onClick={() => handlePreview(policy.category)}
                        >
                          <SearchIcon />
                          {previewingCategory === policy.category ? "Checking..." : "Preview"}
                        </Button>
                      )
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Running the actual sweep (anonymizing eligible records) is a separate, deliberately manual step -- run{" "}
        <code className="rounded bg-muted px-1 py-0.5">pnpm retention:run</code> to preview or{" "}
        <code className="rounded bg-muted px-1 py-0.5">pnpm retention:run --execute</code> to apply it, from the server.
      </p>
    </div>
  );
}
