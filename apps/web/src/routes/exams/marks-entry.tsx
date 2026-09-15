import { useEffect, useState } from "react";

import { api, type Exam, type MarksRosterEntry, type Subject } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function MarksEntry({ exam, subjects }: { exam: Exam; subjects: Subject[] }) {
  const [subjectId, setSubjectId] = useState("");
  const [roster, setRoster] = useState<MarksRosterEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (subjectId) {
      api.getMarksRoster(exam.id, subjectId).then(setRoster);
    } else {
      setRoster([]);
    }
  }, [exam.id, subjectId]);

  const updateEntry = (studentId: string, patch: Partial<MarksRosterEntry>) => {
    setRoster((r) => r.map((e) => (e.student_id === studentId ? { ...e, ...patch } : e)));
  };

  const handleSave = async () => {
    if (!subjectId) return;
    setIsSaving(true);
    setSavedMessage(null);
    try {
      await api.saveMarks({
        exam_id: exam.id,
        subject_id: subjectId,
        entries: roster.map((r) => ({
          student_id: r.student_id,
          max_marks: r.max_marks,
          marks_obtained: r.is_absent ? null : r.marks_obtained,
          is_absent: r.is_absent,
        })),
      });
      setSavedMessage("Marks saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Subject</Label>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((entry) => (
                  <TableRow key={entry.student_id}>
                    <TableCell className="font-medium">
                      {entry.first_name} {entry.last_name ?? ""}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-24"
                        value={entry.max_marks}
                        onChange={(e) =>
                          updateEntry(entry.student_id, { max_marks: Number(e.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-24"
                        disabled={entry.is_absent}
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
                        checked={entry.is_absent}
                        onChange={(e) => updateEntry(entry.student_id, { is_absent: e.target.checked })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {roster.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No students in this exam's class.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {roster.length > 0 && (
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save marks"}
              </Button>
              {savedMessage && <p className="text-sm text-muted-foreground">{savedMessage}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
