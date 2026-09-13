import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type Exam, type SchoolClass, type Subject } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateBackpaperDialog } from "./create-backpaper-dialog";
import { MarksEntry } from "./marks-entry";
import { ReportCardViewer } from "./report-card-viewer";

function EditSubjectDialog({ subject, onUpdated }: { subject: Subject; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(subject.name);
  const [code, setCode] = useState(subject.code ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.updateSubject({ id: subject.id, name, code: code || null });
      setOpen(false);
      onUpdated();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><PencilIcon className="size-3.5" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit subject</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditExamDialog({ exam, onUpdated }: { exam: Exam; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(exam.name);
  const [examDate, setExamDate] = useState(exam.exam_date ?? "");
  const [passingPercentage, setPassingPercentage] = useState(String(exam.passing_percentage));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.updateExam({ id: exam.id, name, exam_date: examDate || null, passing_percentage: Number(passingPercentage) });
      setOpen(false);
      onUpdated();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}><PencilIcon className="size-3.5" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit exam</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Date</Label>
            <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Passing percentage</Label>
            <Input type="number" value={passingPercentage} onChange={(e) => setPassingPercentage(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubjectsTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(() => {
    if (selectedBranchId) api.listSubjects(selectedBranchId).then(setSubjects);
  }, [selectedBranchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) return;
    setIsSubmitting(true);
    try {
      await api.createSubject({ branch_id: selectedBranchId, name, code: code || null });
      setName("");
      setCode("");
      refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New subject</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex items-end gap-4" onSubmit={handleCreate}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subject-name">Name</Label>
              <Input id="subject-name" value={name} onChange={(e) => setName(e.target.value)} required className="w-48" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subject-code">Code (optional)</Label>
              <Input id="subject-code" value={code} onChange={(e) => setCode(e.target.value)} className="w-32" />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              <PlusIcon />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subjects.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.code ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <EditSubjectDialog subject={s} onUpdated={refresh} />
                </TableCell>
              </TableRow>
            ))}
            {subjects.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  No subjects yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ExamsTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [examDate, setExamDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [mode, setMode] = useState<"marks" | "report_card">("marks");

  const refresh = useCallback(() => {
    if (selectedBranchId) api.listExams(selectedBranchId).then(setExams);
  }, [selectedBranchId]);

  useEffect(() => {
    if (selectedBranchId) {
      api.listClasses(selectedBranchId).then(setClasses);
      api.listSubjects(selectedBranchId).then(setSubjects);
    }
    refresh();
  }, [selectedBranchId, refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId || !classId) return;
    const academicSessionId = await api.currentAcademicSessionId();
    if (!academicSessionId) return;
    setIsSubmitting(true);
    try {
      await api.createExam({
        branch_id: selectedBranchId,
        academic_session_id: academicSessionId,
        class_id: classId,
        name,
        exam_date: examDate || null,
      });
      setName("");
      setExamDate("");
      refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New exam</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleCreate}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exam-name">Name</Label>
              <Input id="exam-name" value={name} onChange={(e) => setName(e.target.value)} required className="w-48" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exam-date">Date (optional)</Label>
              <Input id="exam-date" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="w-40" />
            </div>
            <Button type="submit" disabled={isSubmitting || !classId}>
              <PlusIcon />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Date</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exams.map((exam) => (
              <TableRow
                key={exam.id}
                className="cursor-pointer"
                data-state={selectedExam?.id === exam.id ? "selected" : undefined}
                onClick={() => setSelectedExam(exam)}
              >
                <TableCell className="font-medium">
                  {exam.name}
                  {exam.exam_type !== "regular" && (
                    <Badge variant="outline" className="ml-2">{exam.exam_type.replace("_", " ")}</Badge>
                  )}
                </TableCell>
                <TableCell>{classes.find((c) => c.id === exam.class_id)?.name ?? "—"}</TableCell>
                <TableCell>{exam.exam_date ?? "—"}</TableCell>
                <TableCell className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                  {exam.exam_type === "regular" && (
                    <CreateBackpaperDialog exam={exam} subjects={subjects} onCreated={refresh} />
                  )}
                  <EditExamDialog exam={exam} onUpdated={refresh} />
                </TableCell>
              </TableRow>
            ))}
            {exams.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No exams yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectedExam && (
        <div className="flex flex-col gap-3">
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList>
              <TabsTrigger value="marks">Enter marks</TabsTrigger>
              <TabsTrigger value="report_card">Report card</TabsTrigger>
            </TabsList>
            <TabsContent value="marks">
              <MarksEntry exam={selectedExam} subjects={subjects} />
            </TabsContent>
            <TabsContent value="report_card">
              <ReportCardViewer exam={selectedExam} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

export function ExamsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Exams &amp; Report Cards</h1>
        <p className="text-muted-foreground">Subjects, exams, marks entry, and report cards.</p>
      </div>
      <Tabs defaultValue="exams">
        <TabsList>
          <TabsTrigger value="exams">Exams</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
        </TabsList>
        <TabsContent value="exams">
          <ExamsTab />
        </TabsContent>
        <TabsContent value="subjects">
          <SubjectsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
