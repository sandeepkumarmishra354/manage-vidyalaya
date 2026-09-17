import { useEffect, useState } from "react";
import { PrinterIcon, QrCodeIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type AcademicSession, type SchoolClass, type StudentListItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { ID_CARD_TEMPLATES, IdCardPreview, type IdCardTemplate } from "./id-card-templates";
import { QrSlipPreview } from "./qr-slip-templates";

export function IdCardsPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const branches = useAppStore((s) => s.branches);
  const branch = branches.find((b) => b.id === selectedBranchId);

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState<IdCardTemplate>("classic");
  const [mode, setMode] = useState<"cards" | "qr-slips">("cards");
  const [qrTokens, setQrTokens] = useState<Map<string, string>>(new Map());
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (selectedBranchId) api.listClasses(selectedBranchId).then(setClasses);
    api.listAcademicSessions().then(setSessions);
  }, [selectedBranchId]);

  useEffect(() => {
    if (classId) {
      api.listStudentsInClass(classId).then(setStudents);
    } else {
      setStudents([]);
    }
    setSelectedStudentIds(new Set());
  }, [classId]);

  // One bulk fetch per class selection rather than per-card, so a 40-student
  // class doesn't fire 80 individual requests.
  useEffect(() => {
    if (students.length === 0) {
      setQrTokens(new Map());
      setPhotoUrls(new Map());
      return;
    }
    const ids = students.map((s) => s.id);
    api.getStudentQrCodesBulk(ids).then((entries) => {
      setQrTokens(new Map(entries.map((e) => [e.student_id, e.token])));
    });
    api.getStudentPhotoUrlsBulk(ids).then((entries) => {
      setPhotoUrls(new Map(entries.map((e) => [e.student_id, e.url])));
    });
  }, [students]);

  const currentSession = sessions.find((s) => s.is_current);
  const cardsToShow = students.filter((s) => selectedStudentIds.size === 0 || selectedStudentIds.has(s.id));

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between" data-no-print>
        <div>
          <h1 className="text-2xl font-semibold">ID Cards</h1>
          <p className="text-muted-foreground">Generate and print student ID cards -- pick a template and a class.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={mode === "qr-slips" ? "default" : "outline"}
            onClick={() => setMode(mode === "qr-slips" ? "cards" : "qr-slips")}
          >
            <QrCodeIcon />
            {mode === "qr-slips" ? "Show ID cards" : "Print QR Slips"}
          </Button>
          <Button onClick={() => window.print()} disabled={cardsToShow.length === 0}>
            <PrinterIcon />
            Print {cardsToShow.length > 1 ? `${cardsToShow.length} ${mode === "qr-slips" ? "slips" : "cards"}` : mode === "qr-slips" ? "slip" : "card"}
          </Button>
        </div>
      </div>

      <Card data-no-print>
        <CardHeader>
          <CardTitle className="text-base">Select students{mode === "cards" && " & template"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="w-48">
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
          </div>

          {mode === "cards" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ID_CARD_TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTemplate(t.value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    template === t.value ? "border-primary bg-primary/5" : "hover:bg-muted",
                  )}
                >
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </button>
              ))}
            </div>
          )}

          {students.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">
                Students ({selectedStudentIds.size === 0 ? "all" : selectedStudentIds.size} selected)
              </p>
              <div className="flex flex-wrap gap-2">
                {students.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStudent(s.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      selectedStudentIds.has(s.id) || selectedStudentIds.size === 0
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {s.first_name} {s.last_name ?? ""}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {cardsToShow.length > 0 && mode === "cards" && (
        <div data-print-area className="flex flex-wrap gap-4 p-4">
          {cardsToShow.map((student) => (
            <IdCardPreview
              key={student.id}
              template={template}
              student={student}
              branch={branch}
              validTill={currentSession?.end_date ? formatDate(currentSession.end_date) : undefined}
              qrToken={qrTokens.get(student.id)}
              photoUrl={photoUrls.get(student.id)}
            />
          ))}
        </div>
      )}

      {cardsToShow.length > 0 && mode === "qr-slips" && (
        <div data-print-area className="flex flex-wrap gap-4 p-4">
          {cardsToShow
            .filter((student) => qrTokens.has(student.id))
            .map((student) => (
              <QrSlipPreview key={student.id} student={student} token={qrTokens.get(student.id)!} />
            ))}
        </div>
      )}
    </div>
  );
}
