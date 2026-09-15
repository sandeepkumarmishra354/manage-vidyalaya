import { useCallback, useEffect, useState } from "react";

import { useAppStore } from "@/stores/app-store";
import { api, type Exam, type SubmissionStatusEntry } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function SubmissionStatus({ exam, onExamUpdated }: { exam: Exam; onExamUpdated: (exam: Exam) => void }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("exams.manage_exams");
  const [entries, setEntries] = useState<SubmissionStatusEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.getSubmissionStatus(exam.id).then(setEntries);
  }, [exam.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const allComplete = entries.length > 0 && entries.every((e) => e.is_complete);
  const isPublished = !!exam.results_published_at;

  const handlePublish = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await api.publishExamResults(exam.id);
      onExamUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish results.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopen = async () => {
    if (!window.confirm("Reopen results for editing? The report card will show as provisional again.")) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await api.reopenExamResults(exam.id);
      onExamUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reopen results.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Marks submission progress per subject, across every student who needs it (mandatory subjects, or an
          elective they've chosen).
        </p>
        {canManage && (
          <div className="flex items-center gap-2">
            {isPublished ? (
              <Button variant="outline" onClick={handleReopen} disabled={isSubmitting}>
                {isSubmitting ? "Reopening..." : "Reopen results"}
              </Button>
            ) : (
              <Button onClick={handlePublish} disabled={isSubmitting || !allComplete}>
                {isSubmitting ? "Publishing..." : "Publish results"}
              </Button>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {isPublished && <Badge variant="success">Results published</Badge>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Teacher(s)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.subject_id}>
                <TableCell className="font-medium">{entry.subject_name}</TableCell>
                <TableCell>
                  {entry.entered_count} / {entry.expected_count}
                </TableCell>
                <TableCell>
                  <Badge variant={entry.is_complete ? "success" : "warning"}>
                    {entry.is_complete ? "Complete" : "Pending"}
                  </Badge>
                </TableCell>
                <TableCell>{entry.teachers.length > 0 ? entry.teachers.join(", ") : "—"}</TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No applicable subjects found for this exam's class.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
