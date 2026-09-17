import { useEffect, useState } from "react";
import { PlusIcon, PrinterIcon, Trash2Icon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  type ClassSubject,
  type PeriodSlot,
  type PeriodType,
  type SchoolClass,
  type Section,
  type SectionTimetableEntryInput,
  type StaffListItem,
  type StaffTimetableEntry,
} from "@/lib/api";
import { PrintLetterhead } from "@/components/print-letterhead";
import { PrintFrame, type PrintPaperColor, type PrintTemplate } from "@/components/print-templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = [1, 2, 3, 4, 5, 6, 0]; // Monday-first display order

type GridEntry = SectionTimetableEntryInput & { subject_name?: string; staff_name?: string };

export function TimetablePage() {
  const hasPermission = useAppStore((s) => s.hasPermission);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Timetable</h1>
        <p className="text-muted-foreground">Weekly class schedule, subject-wise periods, breaks &amp; lunch.</p>
      </div>
      <Tabs defaultValue={hasPermission("timetable.manage") ? "editor" : "mine"}>
        <TabsList>
          {hasPermission("timetable.manage") && <TabsTrigger value="editor">Grid Editor</TabsTrigger>}
          <TabsTrigger value="mine">My Schedule</TabsTrigger>
          {hasPermission("timetable.manage") && <TabsTrigger value="periods">Manage Periods</TabsTrigger>}
        </TabsList>
        {hasPermission("timetable.manage") && (
          <TabsContent value="editor">
            <GridEditorTab />
          </TabsContent>
        )}
        <TabsContent value="mine">
          <MyScheduleTab />
        </TabsContent>
        {hasPermission("timetable.manage") && (
          <TabsContent value="periods">
            <ManagePeriodsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function EditCellDialog({
  open,
  onOpenChange,
  classSubjects,
  staff,
  initial,
  onSave,
  onClear,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classSubjects: ClassSubject[];
  staff: StaffListItem[];
  initial: GridEntry | null;
  onSave: (subjectId: string, staffId: string, roomName: string) => void;
  onClear: () => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [roomName, setRoomName] = useState("");

  useEffect(() => {
    if (open) {
      setSubjectId(initial?.subject_id ?? "");
      setStaffId(initial?.staff_id ?? "");
      setRoomName(initial?.room_name ?? "");
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign period</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Subject</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {classSubjects.map((cs) => (
                  <SelectItem key={cs.subject_id} value={cs.subject_id}>
                    {cs.subject_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Teacher</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select teacher" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="room-name">Room (optional)</Label>
            <Input id="room-name" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {initial && (
            <Button type="button" variant="ghost" onClick={onClear}>
              Clear
            </Button>
          )}
          <Button
            type="button"
            disabled={!subjectId || !staffId}
            onClick={() => onSave(subjectId, staffId, roomName)}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GridEditorTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const branches = useAppStore((s) => s.branches);
  const branch = branches.find((b) => b.id === selectedBranchId);
  const template = (branch?.print_template as PrintTemplate) || "classic";
  const paperColor = (branch?.print_paper_color as PrintPaperColor) || "white";

  const [academicSessionId, setAcademicSessionId] = useState("");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [periodSlots, setPeriodSlots] = useState<PeriodSlot[]>([]);
  const [entries, setEntries] = useState<GridEntry[]>([]);
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([]);
  const [weeklyHalfDays, setWeeklyHalfDays] = useState<number[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [staffList, setStaffList] = useState<StaffListItem[]>([]);
  const [editingCell, setEditingCell] = useState<{ dayOfWeek: number; periodSlotId: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.currentAcademicSessionId().then((id) => setAcademicSessionId(id ?? ""));
  }, []);

  useEffect(() => {
    if (selectedBranchId) {
      api.listClasses(selectedBranchId).then(setClasses);
      api.listStaff(selectedBranchId).then(setStaffList);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    if (classId) {
      api.listSections(classId).then(setSections);
      api.listClassSubjects(classId).then(setClassSubjects);
    } else {
      setSections([]);
      setClassSubjects([]);
    }
    setSectionId("");
  }, [classId]);

  useEffect(() => {
    if (selectedBranchId && academicSessionId) {
      api.listPeriodSlots(selectedBranchId, academicSessionId).then(setPeriodSlots);
    }
  }, [selectedBranchId, academicSessionId]);

  useEffect(() => {
    if (sectionId && academicSessionId) {
      api.getSectionTimetable(sectionId, academicSessionId).then((tt) => {
        setEntries(
          tt.entries.map((e) => ({
            day_of_week: e.day_of_week,
            period_slot_id: e.period_slot_id,
            subject_id: e.subject_id,
            subject_name: e.subject_name,
            staff_id: e.staff_id,
            staff_name: e.staff_name,
            room_name: e.room_name,
          })),
        );
        setWeeklyOffDays(tt.weekly_off_days);
        setWeeklyHalfDays(tt.weekly_half_days);
      });
      setWarnings([]);
    } else {
      setEntries([]);
    }
  }, [sectionId, academicSessionId]);

  const findEntry = (dayOfWeek: number, periodSlotId: string) =>
    entries.find((e) => e.day_of_week === dayOfWeek && e.period_slot_id === periodSlotId) ?? null;

  const handleSaveCell = (subjectId: string, staffId: string, roomName: string) => {
    if (!editingCell) return;
    const subjectName = classSubjects.find((cs) => cs.subject_id === subjectId)?.subject_name;
    const staff = staffList.find((s) => s.id === staffId);
    const staffName = staff ? `${staff.first_name} ${staff.last_name ?? ""}`.trim() : undefined;
    setEntries((list) => [
      ...list.filter((e) => !(e.day_of_week === editingCell.dayOfWeek && e.period_slot_id === editingCell.periodSlotId)),
      {
        day_of_week: editingCell.dayOfWeek,
        period_slot_id: editingCell.periodSlotId,
        subject_id: subjectId,
        staff_id: staffId,
        room_name: roomName || null,
        subject_name: subjectName,
        staff_name: staffName,
      },
    ]);
    setEditingCell(null);
  };

  const handleClearCell = () => {
    if (!editingCell) return;
    setEntries((list) =>
      list.filter((e) => !(e.day_of_week === editingCell.dayOfWeek && e.period_slot_id === editingCell.periodSlotId)),
    );
    setEditingCell(null);
  };

  const handleSave = async () => {
    if (!selectedBranchId || !sectionId) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = await api.saveSectionTimetable(sectionId, {
        branch_id: selectedBranchId,
        class_id: classId,
        academic_session_id: academicSessionId,
        entries: entries.map((e) => ({
          day_of_week: e.day_of_week,
          period_slot_id: e.period_slot_id,
          subject_id: e.subject_id,
          staff_id: e.staff_id,
          room_name: e.room_name,
        })),
      });
      setWarnings(result.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const className = classes.find((c) => c.id === classId)?.name;
  const sectionName = sections.find((s) => s.id === sectionId)?.name;
  const teachingSlots = periodSlots.filter((p) => p.period_type === "teaching");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
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
        <Select value={sectionId} onValueChange={setSectionId} disabled={sections.length === 0}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Select section" />
          </SelectTrigger>
          <SelectContent>
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sectionId && (
          <>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save timetable"}
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <PrinterIcon />
              Print
            </Button>
          </>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {warnings.length > 0 && (
        <Card className="border-warning">
          <CardContent className="pt-4 text-sm text-muted-foreground">
            {warnings.map((w, i) => (
              <p key={i}>⚠ {w}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {sectionId && periodSlots.length > 0 && (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                {DAYS.map((d) => (
                  <TableHead
                    key={d}
                    className={weeklyOffDays.includes(d) ? "bg-muted/60 text-muted-foreground" : ""}
                  >
                    {DAY_LABELS[d]}
                    {weeklyHalfDays.includes(d) && !weeklyOffDays.includes(d) ? " (half)" : ""}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {periodSlots.map((slot) =>
                slot.period_type === "teaching" ? (
                  <TableRow key={slot.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {slot.name}
                      <div className="text-xs text-muted-foreground">
                        {slot.start_time}–{slot.end_time}
                      </div>
                    </TableCell>
                    {DAYS.map((d) => {
                      const entry = findEntry(d, slot.id);
                      const isOff = weeklyOffDays.includes(d);
                      return (
                        <TableCell
                          key={d}
                          className={isOff ? "bg-muted/40" : "cursor-pointer hover:bg-accent/40"}
                          onClick={() => !isOff && setEditingCell({ dayOfWeek: d, periodSlotId: slot.id })}
                        >
                          {entry ? (
                            <div className="text-xs">
                              <div className="font-medium">{entry.subject_name}</div>
                              <div className="text-muted-foreground">{entry.staff_name}</div>
                              {entry.room_name && <div className="text-muted-foreground">{entry.room_name}</div>}
                            </div>
                          ) : !isOff ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : null}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ) : (
                  <TableRow key={slot.id} className="bg-muted/30">
                    <TableCell colSpan={DAYS.length + 1} className="text-center text-xs font-medium">
                      {slot.name} ({slot.start_time}–{slot.end_time})
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {sectionId && teachingSlots.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No period slots defined yet. Add some in the "Manage Periods" tab first.
        </p>
      )}

      <EditCellDialog
        open={editingCell !== null}
        onOpenChange={(v) => !v && setEditingCell(null)}
        classSubjects={classSubjects}
        staff={staffList}
        initial={editingCell ? findEntry(editingCell.dayOfWeek, editingCell.periodSlotId) : null}
        onSave={handleSaveCell}
        onClear={handleClearCell}
      />

      {sectionId && (
        <div data-print-area className="hidden print:block">
          <PrintFrame template={template} paperColor={paperColor} branch={branch}>
            <PrintLetterhead
              branch={branch}
              documentTitle="Class Timetable"
              template={template}
              right={
                <div className="text-sm">
                  <div>
                    Class: {className} {sectionName}
                  </div>
                </div>
              }
            />
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border p-1">Period</th>
                  {DAYS.map((d) => (
                    <th key={d} className="border p-1">
                      {DAY_LABELS[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodSlots.map((slot) => (
                  <tr key={slot.id}>
                    <td className="border p-1">
                      {slot.name}
                      <br />
                      {slot.start_time}–{slot.end_time}
                    </td>
                    {slot.period_type === "teaching" ? (
                      DAYS.map((d) => {
                        const entry = findEntry(d, slot.id);
                        return (
                          <td key={d} className="border p-1 text-center">
                            {entry ? (
                              <>
                                {entry.subject_name}
                                <br />
                                {entry.staff_name}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })
                    ) : (
                      <td colSpan={DAYS.length} className="border p-1 text-center font-medium">
                        {slot.name}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </PrintFrame>
        </div>
      )}
    </div>
  );
}

function MyScheduleTab() {
  const [academicSessionId, setAcademicSessionId] = useState("");
  const [entries, setEntries] = useState<StaffTimetableEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.currentAcademicSessionId().then((id) => setAcademicSessionId(id ?? ""));
  }, []);

  useEffect(() => {
    if (academicSessionId) {
      api
        .getMyTimetable(academicSessionId)
        .then(setEntries)
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }
  }, [academicSessionId]);

  if (error) {
    return <p className="text-sm text-muted-foreground">{error}</p>;
  }

  const byDay = DAYS.map((d) => ({
    day: d,
    entries: entries.filter((e) => e.day_of_week === d).sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {byDay.map(({ day, entries: dayEntries }) => (
        <Card key={day}>
          <CardHeader>
            <CardTitle className="text-base">{DAY_LABELS[day]}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {dayEntries.length === 0 && <p className="text-sm text-muted-foreground">No periods.</p>}
            {dayEntries.map((e) => (
              <div key={e.id} className="rounded-md border p-2 text-sm">
                <div className="font-medium">
                  {e.subject_name} — {e.class_name} {e.section_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {e.period_name} ({e.start_time}–{e.end_time}) {e.room_name ? `· ${e.room_name}` : ""}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ManagePeriodsTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [academicSessionId, setAcademicSessionId] = useState("");
  const [slots, setSlots] = useState<PeriodSlot[]>([]);
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [periodType, setPeriodType] = useState<PeriodType>("teaching");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.currentAcademicSessionId().then((id) => setAcademicSessionId(id ?? ""));
  }, []);

  const refresh = () => {
    if (selectedBranchId && academicSessionId) {
      api.listPeriodSlots(selectedBranchId, academicSessionId).then(setSlots);
    }
  };

  useEffect(refresh, [selectedBranchId, academicSessionId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId || !academicSessionId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await api.createPeriodSlot({
        branch_id: selectedBranchId,
        academic_session_id: academicSessionId,
        name,
        start_time: startTime,
        end_time: endTime,
        period_type: periodType,
      });
      setName("");
      setStartTime("");
      setEndTime("");
      setPeriodType("teaching");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await api.deletePeriodSlot(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New period slot</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleAdd}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slot-name">Name</Label>
              <Input id="slot-name" value={name} onChange={(e) => setName(e.target.value)} required className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slot-start">Start time</Label>
              <Input id="slot-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slot-end">End time</Label>
              <Input id="slot-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teaching">Teaching</SelectItem>
                  <SelectItem value="break">Break</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={isSubmitting}>
              <PlusIcon />
              Add
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slots.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>
                  {s.start_time}–{s.end_time}
                </TableCell>
                <TableCell className="capitalize">{s.period_type}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}>
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {slots.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No period slots yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
