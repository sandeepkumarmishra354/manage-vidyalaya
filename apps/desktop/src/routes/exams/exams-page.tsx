import { useCallback, useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type Exam, type SchoolClass, type Subject } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarksEntry } from "./marks-entry";
import { ReportCardViewer } from "./report-card-viewer";

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {subjects.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.code ?? "—"}</TableCell>
              </TableRow>
            ))}
            {subjects.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
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
                <TableCell className="font-medium">{exam.name}</TableCell>
                <TableCell>{classes.find((c) => c.id === exam.class_id)?.name ?? "—"}</TableCell>
                <TableCell>{exam.exam_date ?? "—"}</TableCell>
              </TableRow>
            ))}
            {exams.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
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
