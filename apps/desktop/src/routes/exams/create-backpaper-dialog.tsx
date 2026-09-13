import { useState } from "react";
import { ClipboardPlusIcon } from "lucide-react";

import { api, type Exam, type Subject } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CreateBackpaperDialog({
  exam,
  subjects,
  onCreated,
}: {
  exam: Exam;
  subjects: Subject[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [candidateCount, setCandidateCount] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePickSubject = async (id: string) => {
    setSubjectId(id);
    const candidates = await api.listStudentsPendingBackpaper(exam.id, id);
    setCandidateCount(candidates.length);
  };

  const handleCreate = async () => {
    if (!subjectId) return;
    setIsSubmitting(true);
    try {
      const subject = subjects.find((s) => s.id === subjectId);
      await api.createExam({
        branch_id: exam.branch_id,
        academic_session_id: exam.academic_session_id,
        class_id: exam.class_id,
        name: `${exam.name} Back Paper${subject ? ` - ${subject.name}` : ""}`,
        exam_date: null,
        exam_type: "back_paper",
        parent_exam_id: exam.id,
      });
      setOpen(false);
      setSubjectId("");
      setCandidateCount(null);
      onCreated();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
          <ClipboardPlusIcon />
          Back paper
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a back paper exam</DialogTitle>
          <DialogDescription>
            Linked to "{exam.name}". Students who failed or were absent for the chosen subject can
            then have marks entered against this new exam.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Subject</Label>
            <Select value={subjectId} onValueChange={handlePickSubject}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select subject" /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {candidateCount !== null && (
            <p className="text-sm text-muted-foreground">
              {candidateCount} student{candidateCount === 1 ? "" : "s"} failed or were absent for this subject.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={!subjectId || isSubmitting}>
            {isSubmitting ? "Creating..." : "Create back paper exam"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
