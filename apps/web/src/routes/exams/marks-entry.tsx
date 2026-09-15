import { useEffect, useState } from "react";

import { useAppStore } from "@/stores/app-store";
import { api, type Exam, type ExamResult, type MarksRosterEntry, type Subject } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type RosterEntry = MarksRosterEntry & { override_result?: ExamResult | null };

const RESULT_BADGE_VARIANT: Record<ExamResult, "success" | "destructive" | "warning"> = {
  pass: "success",
  fail: "destructive",
  grace: "warning",
};

function computePreview(entry: RosterEntry, passingPercentage: number): ExamResult | null {
  if (entry.override_result) return entry.override_result;
  if (entry.is_absent) return "fail";
  if (entry.marks_obtained === null || entry.marks_obtained === undefined) return null;
  const percentage = (entry.marks_obtained / entry.max_marks) * 100;
  return percentage >= passingPercentage ? "pass" : "fail";
}

export function MarksEntry({ exam, subjects }: { exam: Exam; subjects: Subject[] }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canEnterAny = hasPermission("exams.enter_marks");
  const isPublished = !!exam.results_published_at;

  const [mySubjectIds, setMySubjectIds] = useState<Set<string> | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (canEnterAny) {
      setMySubjectIds(null);
    } else {
      api.getMyTeachingAssignments(exam.id).then((list) => setMySubjectIds(new Set(list.map((a) => a.subject_id))));
    }
  }, [exam.id, canEnterAny]);

  useEffect(() => {
    if (subjectId) {
      api.getMarksRoster(exam.id, subjectId).then(setRoster);
    } else {
      setRoster([]);
    }
  }, [exam.id, subjectId]);

  const updateEntry = (studentId: string, patch: Partial<RosterEntry>) => {
    setRoster((r) => r.map((e) => (e.student_id === studentId ? { ...e, ...patch } : e)));
  };

  const toggleGrace = (entry: RosterEntry) => {
    updateEntry(entry.student_id, { override_result: entry.override_result === "grace" ? null : "grace" });
  };

  const handleSave = async () => {
    if (!subjectId) return;
    setIsSaving(true);
    setSavedMessage(null);
    setError(null);
    try {
      await api.saveMarks({
        exam_id: exam.id,
        subject_id: subjectId,
        entries: roster.map((r) => ({
          student_id: r.student_id,
          max_marks: r.max_marks,
          marks_obtained: r.is_absent ? null : r.marks_obtained,
          is_absent: r.is_absent,
          override_result: r.override_result ?? null,
        })),
      });
      setSavedMessage("Marks saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save marks.");
    } finally {
      setIsSaving(false);
    }
  };

  const availableSubjects = mySubjectIds ? subjects.filter((s) => mySubjectIds.has(s.id)) : subjects;

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      {isPublished && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          Results have been published for this exam. Reopen results (Submission status tab) to make further edits.
        </p>
      )}

      <div className="flex items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Subject</Label>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select subject" />
            </SelectTrigger>
            <SelectContent>
              {availableSubjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {mySubjectIds && availableSubjects.length === 0 && (
          <p className="text-sm text-muted-foreground">You aren't assigned to teach any subject for this class.</p>
        )}
      </div>

      {subjectId && (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Max marks</TableHead>
                  <TableHead>Marks obtained</TableHead>
                  <TableHead>Absent</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Grace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((entry) => {
                  const preview = computePreview(entry, exam.passing_percentage);
                  return (
                    <TableRow key={entry.student_id}>
                      <TableCell className="font-medium">
                        {entry.first_name} {entry.last_name ?? ""}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="w-24"
                          disabled={isPublished}
                          value={entry.max_marks}
                          onChange={(e) => updateEntry(entry.student_id, { max_marks: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="w-24"
                          disabled={isPublished || entry.is_absent}
                          value={entry.marks_obtained ?? ""}
                          onChange={(e) =>
                            updateEntry(entry.student_id, {
                              marks_obtained: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          type="checkbox"
                          disabled={isPublished}
                          checked={entry.is_absent}
                          onChange={(e) => updateEntry(entry.student_id, { is_absent: e.target.checked })}
                        />
                      </TableCell>
                      <TableCell>
                        {preview ? (
                          <Badge variant={RESULT_BADGE_VARIANT[preview]} className="capitalize">
                            {preview}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant={entry.override_result === "grace" ? "default" : "outline"}
                          size="sm"
                          disabled={isPublished}
                          onClick={() => toggleGrace(entry)}
                        >
                          Grace
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {roster.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No students in this exam's class.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {roster.length > 0 && !isPublished && (
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save marks"}
              </Button>
              {savedMessage && <p className="text-sm text-muted-foreground">{savedMessage}</p>}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
