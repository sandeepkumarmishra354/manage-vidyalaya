import { useCallback, useEffect, useState } from "react";
import { differenceInCalendarMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  type AcademicSession,
  type CalendarHoliday,
  type ClassSubject,
  type DayType,
  type ElectiveGroup,
  type SchoolCalendarData,
  type SchoolClass,
  type Section,
  type Subject,
} from "@/lib/api";
import { formatDate } from "@/lib/date";
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
import { PromotionTab } from "./promotion-tab";

function SchoolDetailsTab() {
  const branches = useAppStore((s) => s.branches);
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const refreshBranches = useAppStore((s) => s.refreshBranches);
  const branch = branches.find((b) => b.id === selectedBranchId);

  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
    email: "",
    logo_url: "",
    signature_url: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);

  useEffect(() => {
    if (branch) {
      setForm({
        name: branch.name,
        address: branch.address ?? "",
        city: branch.city ?? "",
        state: branch.state ?? "",
        pincode: branch.pincode ?? "",
        phone: branch.phone ?? "",
        email: branch.email ?? "",
        logo_url: branch.logo_url ?? "",
        signature_url: branch.signature_url ?? "",
      });
    }
  }, [branch]);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const SIGNATURE_MAX_BYTES = 200 * 1024;

  const handleSignatureFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSignatureError(null);
    if (file.size > SIGNATURE_MAX_BYTES) {
      setSignatureError(`Image is too large (max ${SIGNATURE_MAX_BYTES / 1024}KB).`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, signature_url: reader.result as string }));
    reader.onerror = () => setSignatureError("Could not read that file. Please try again.");
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branch) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await api.updateBranch({
        id: branch.id,
        name: form.name,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        phone: form.phone || null,
        email: form.email || null,
        logo_url: form.logo_url || null,
        signature_url: form.signature_url || null,
      });
      await refreshBranches();
      setMessage("Saved.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!branch) {
    return <p className="text-muted-foreground">Select a branch to edit its details.</p>;
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">School details</CardTitle>
        <p className="text-sm text-muted-foreground">
          Shown on printed documents: attendance registers, report cards, payslips, and fee receipts.
        </p>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="school-name">Name</Label>
            <Input id="school-name" value={form.name} onChange={update("name")} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="school-address">Address</Label>
            <Input id="school-address" value={form.address} onChange={update("address")} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-city">City</Label>
              <Input id="school-city" value={form.city} onChange={update("city")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-state">State</Label>
              <Input id="school-state" value={form.state} onChange={update("state")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-pincode">Pincode</Label>
              <Input id="school-pincode" value={form.pincode} onChange={update("pincode")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-phone">Phone</Label>
              <Input id="school-phone" value={form.phone} onChange={update("phone")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-email">Email</Label>
              <Input id="school-email" type="email" value={form.email} onChange={update("email")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="school-logo">Logo URL</Label>
            <Input id="school-logo" placeholder="https://..." value={form.logo_url} onChange={update("logo_url")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="school-signature">Signature (for printed documents)</Label>
            <p className="text-xs text-muted-foreground">
              Shown above "Authorized signatory" on payslips, fee receipts, attendance registers, and report cards.
              PNG or JPEG, up to 200KB.
            </p>
            <div className="flex items-center gap-3">
              {form.signature_url && (
                <img src={form.signature_url} alt="Signature preview" className="h-14 rounded border object-contain p-1" />
              )}
              <Input id="school-signature" type="file" accept="image/png,image/jpeg" onChange={handleSignatureFile} className="max-w-64" />
              {form.signature_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, signature_url: "" }))}
                >
                  Remove
                </Button>
              )}
            </div>
            {signatureError && <p className="text-sm text-destructive">{signatureError}</p>}
          </div>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EditSessionDialog({ session, onUpdated }: { session: AcademicSession; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(session.name);
  const [startDate, setStartDate] = useState(session.start_date);
  const [endDate, setEndDate] = useState(session.end_date);
  const [isCurrent, setIsCurrent] = useState(session.is_current);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.updateAcademicSession({ id: session.id, name, start_date: startDate, end_date: endDate, is_current: isCurrent });
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
        <DialogHeader>
          <DialogTitle>Edit academic session</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isCurrent} onChange={(e) => setIsCurrent(e.target.checked)} className="size-4 rounded border-input" />
            Current session
          </label>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AcademicSessionsTab({ onChanged }: { onChanged: () => void }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("academic_setup.manage_sessions");
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(() => {
    api.listAcademicSessions().then(setSessions);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.createAcademicSession({
        name,
        start_date: startDate,
        end_date: endDate,
        is_current: sessions.length === 0,
      });
      setName("");
      setStartDate("");
      setEndDate("");
      refresh();
      onChanged();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New academic session</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleCreate}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="session-name">Name</Label>
              <Input
                id="session-name"
                placeholder="e.g. 2027-2028"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="session-start">Start date</Label>
              <Input
                id="session-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="session-end">End date</Label>
              <Input
                id="session-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-40"
              />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              <PlusIcon />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{formatDate(s.start_date)}</TableCell>
                <TableCell>{formatDate(s.end_date)}</TableCell>
                <TableCell>{s.is_current && <Badge>Current</Badge>}</TableCell>
                <TableCell>
                  {canManage && <EditSessionDialog session={s} onUpdated={() => { refresh(); onChanged(); }} />}
                </TableCell>
              </TableRow>
            ))}
            {sessions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No academic sessions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ClassesAndSectionsTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManageClasses = hasPermission("academic_setup.manage_classes");
  const canManageSections = hasPermission("academic_setup.manage_sections");
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, Section[]>>({});

  const [className, setClassName] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [isCreatingClass, setIsCreatingClass] = useState(false);

  const [sectionClassId, setSectionClassId] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [isCreatingSection, setIsCreatingSection] = useState(false);

  const refreshClasses = useCallback(() => {
    if (!selectedBranchId) return;
    api.listClasses(selectedBranchId).then(async (list) => {
      setClasses(list);
      const entries = await Promise.all(list.map(async (c) => [c.id, await api.listSections(c.id)] as const));
      setSectionsByClass(Object.fromEntries(entries));
    });
  }, [selectedBranchId]);

  useEffect(() => {
    api.listAcademicSessions().then((list) => {
      setSessions(list);
      setSessionId((current) => current || list.find((s) => s.is_current)?.id || list[0]?.id || "");
    });
    refreshClasses();
  }, [refreshClasses]);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId || !sessionId) return;
    setIsCreatingClass(true);
    try {
      await api.createClass({
        branch_id: selectedBranchId,
        academic_session_id: sessionId,
        name: className,
        sort_order: Number(sortOrder) || 0,
      });
      setClassName("");
      setSortOrder("");
      refreshClasses();
    } finally {
      setIsCreatingClass(false);
    }
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionClassId) return;
    setIsCreatingSection(true);
    try {
      await api.createSection({ class_id: sectionClassId, name: sectionName });
      setSectionName("");
      refreshClasses();
    } finally {
      setIsCreatingSection(false);
    }
  };

  const handleRenameClass = async (c: SchoolClass) => {
    const name = window.prompt("Rename class", c.name);
    if (!name || name === c.name) return;
    await api.updateClass({ id: c.id, name, sort_order: c.sort_order });
    refreshClasses();
  };

  const handleDeleteClass = async (c: SchoolClass) => {
    if (!window.confirm(`Delete class "${c.name}"? This cannot be undone.`)) return;
    await api.deleteClass(c.id);
    refreshClasses();
  };

  const handleDeleteSection = async (s: Section) => {
    if (!window.confirm(`Delete section "${s.name}"?`)) return;
    await api.deleteSection(s.id);
    refreshClasses();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {canManageClasses && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New class</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-wrap items-end gap-4" onSubmit={handleCreateClass}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="class-name">Name</Label>
                <Input
                  id="class-name"
                  placeholder="e.g. Class 9"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  required
                  className="w-36"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="class-sort">Sort order</Label>
                <Input
                  id="class-sort"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="w-24"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Session</Label>
                <Select value={sessionId} onValueChange={setSessionId}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select session" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={isCreatingClass || !sessionId}>
                <PlusIcon />
                Add class
              </Button>
            </form>
          </CardContent>
        </Card>
        )}

        {canManageSections && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New section</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-wrap items-end gap-4" onSubmit={handleCreateSection}>
              <div className="flex flex-col gap-1.5">
                <Label>Class</Label>
                <Select value={sectionClassId} onValueChange={setSectionClassId}>
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
                <Label htmlFor="section-name">Name</Label>
                <Input
                  id="section-name"
                  placeholder="e.g. B"
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  required
                  className="w-24"
                />
              </div>
              <Button type="submit" disabled={isCreatingSection || !sectionClassId}>
                <PlusIcon />
                Add section
              </Button>
            </form>
          </CardContent>
        </Card>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>Sections</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {classes.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="flex flex-wrap gap-1.5">
                  {(sectionsByClass[c.id] ?? []).map((sec) => (
                    <Badge key={sec.id} variant="outline" className="gap-1">
                      {sec.name}
                      {canManageSections && (
                        <button onClick={() => handleDeleteSection(sec)} className="text-muted-foreground hover:text-destructive">
                          <XIcon className="size-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                  {(sectionsByClass[c.id] ?? []).length === 0 && (
                    <span className="text-muted-foreground">No sections yet</span>
                  )}
                </TableCell>
                <TableCell className="flex justify-end gap-1">
                  {canManageClasses && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => handleRenameClass(c)}>
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteClass(c)}>
                        <XIcon className="size-3.5" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {classes.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  No classes yet for this branch.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ClassSubjectsTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("exams.manage_subjects");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [electiveGroups, setElectiveGroups] = useState<ElectiveGroup[]>([]);

  const [newSubjectId, setNewSubjectId] = useState("");
  const [newIsElective, setNewIsElective] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupMemberSelections, setGroupMemberSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    if (selectedBranchId) {
      api.listClasses(selectedBranchId).then(setClasses);
      api.listSubjects(selectedBranchId).then(setSubjects);
    }
  }, [selectedBranchId]);

  const refresh = useCallback(() => {
    if (!classId) return;
    api.listClassSubjects(classId).then(setClassSubjects);
    api.listElectiveGroups(classId).then(setElectiveGroups);
  }, [classId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !newSubjectId) return;
    await api.addClassSubject(classId, newSubjectId, newIsElective);
    setNewSubjectId("");
    setNewIsElective(false);
    refresh();
  };

  const handleRemoveSubject = async (cs: ClassSubject) => {
    if (!window.confirm(`Remove ${cs.subject_name} from this class?`)) return;
    await api.removeClassSubject(cs.id);
    refresh();
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !newGroupName) return;
    await api.createElectiveGroup(classId, newGroupName);
    setNewGroupName("");
    refresh();
  };

  const handleAddMember = async (groupId: string) => {
    const classSubjectId = groupMemberSelections[groupId];
    if (!classSubjectId) return;
    await api.addElectiveGroupMember(groupId, classSubjectId);
    setGroupMemberSelections((s) => ({ ...s, [groupId]: "" }));
    refresh();
  };

  const handleRemoveMember = async (groupId: string, classSubjectId: string) => {
    await api.removeElectiveGroupMember(groupId, classSubjectId);
    refresh();
  };

  const handleDeleteGroup = async (group: ElectiveGroup) => {
    if (!window.confirm(`Delete elective group "${group.name}"?`)) return;
    try {
      await api.deleteElectiveGroup(group.id);
      refresh();
    } catch {
      window.alert("Could not delete: students have already chosen from this group.");
    }
  };

  const availableSubjects = subjects.filter((s) => !classSubjects.some((cs) => cs.subject_id === s.id));
  const electiveClassSubjects = classSubjects.filter((cs) => cs.is_elective);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Class</Label>
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select a class" />
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

      {classId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subjects for this class</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {canManage && (
                <form className="flex flex-wrap items-end gap-4" onSubmit={handleAddSubject}>
                  <div className="flex flex-col gap-1.5">
                    <Label>Subject</Label>
                    <Select value={newSubjectId} onValueChange={setNewSubjectId}>
                      <SelectTrigger className="w-52">
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
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newIsElective}
                      onChange={(e) => setNewIsElective(e.target.checked)}
                      className="size-4 rounded border-input"
                    />
                    Elective
                  </label>
                  <Button type="submit" disabled={!newSubjectId}>
                    <PlusIcon />
                    Add
                  </Button>
                </form>
              )}

              <div className="flex flex-wrap gap-1.5">
                {classSubjects.map((cs) => (
                  <Badge key={cs.id} variant={cs.is_elective ? "secondary" : "outline"} className="gap-1">
                    {cs.subject_name}
                    {cs.is_elective && <span className="text-xs opacity-70">(elective)</span>}
                    {canManage && (
                      <button
                        onClick={() => handleRemoveSubject(cs)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <XIcon className="size-3" />
                      </button>
                    )}
                  </Badge>
                ))}
                {classSubjects.length === 0 && (
                  <span className="text-sm text-muted-foreground">No subjects mapped to this class yet.</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Elective groups</CardTitle>
              <p className="text-sm text-muted-foreground">
                A group of choice-based subjects (e.g. Art vs Computer) a student picks one from. Only subjects
                marked "Elective" above can be added to a group.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {canManage && (
                <form className="flex items-end gap-4" onSubmit={handleCreateGroup}>
                  <div className="flex flex-col gap-1.5">
                    <Label>New group name</Label>
                    <Input
                      placeholder="e.g. Elective 1"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-52"
                    />
                  </div>
                  <Button type="submit" disabled={!newGroupName}>
                    <PlusIcon />
                    Add group
                  </Button>
                </form>
              )}

              <div className="flex flex-col gap-3">
                {electiveGroups.map((group) => {
                  const availableMembers = electiveClassSubjects.filter(
                    (cs) => !group.members.some((m) => m.class_subject_id === cs.id),
                  );
                  return (
                    <div key={group.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{group.name}</p>
                        {canManage && (
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteGroup(group)}>
                            <XIcon className="size-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {group.members.map((m) => (
                          <Badge key={m.id} variant="outline" className="gap-1">
                            {m.subject_name}
                            {canManage && (
                              <button
                                onClick={() => handleRemoveMember(group.id, m.class_subject_id)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <XIcon className="size-3" />
                              </button>
                            )}
                          </Badge>
                        ))}
                        {group.members.length === 0 && (
                          <span className="text-sm text-muted-foreground">No subjects in this group yet.</span>
                        )}
                      </div>
                      {canManage && availableMembers.length > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <Select
                            value={groupMemberSelections[group.id] ?? ""}
                            onValueChange={(v) => setGroupMemberSelections((s) => ({ ...s, [group.id]: v }))}
                          >
                            <SelectTrigger className="w-52">
                              <SelectValue placeholder="Add subject to group" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableMembers.map((cs) => (
                                <SelectItem key={cs.id} value={cs.id}>
                                  {cs.subject_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="sm" onClick={() => handleAddMember(group.id)}>
                            Add
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {electiveGroups.length === 0 && (
                  <p className="text-sm text-muted-foreground">No elective groups yet for this class.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function HolidayDialog({
  branchId,
  sessionId,
  date,
  existing,
  onClose,
  onSaved,
}: {
  branchId: string;
  sessionId: string;
  date: Date;
  existing: CalendarHoliday | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<"holiday" | "half_day">(existing?.type ?? "holiday");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const iso = format(date, "yyyy-MM-dd");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (existing) {
        await api.updateHoliday(existing.id, { date: iso, name, type });
      } else {
        await api.addHoliday({ branch_id: branchId, academic_session_id: sessionId, date: iso, name, type });
      }
      onSaved();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = async () => {
    if (!existing) return;
    if (!window.confirm(`Remove holiday "${existing.name}"?`)) return;
    setIsSubmitting(true);
    try {
      await api.deleteHoliday(existing.id);
      onSaved();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{format(date, "EEEE, d MMMM yyyy")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSave}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="holiday-name">Name</Label>
            <Input
              id="holiday-name"
              placeholder="e.g. Diwali"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "holiday" | "half_day")}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="holiday">Full holiday</SelectItem>
                <SelectItem value="half_day">Half day</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="sm:justify-between">
            {existing ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={handleClear} disabled={isSubmitting}>
                Clear override
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={isSubmitting || !name}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SchoolCalendarTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("academic_setup.manage_sessions");

  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [calendar, setCalendar] = useState<SchoolCalendarData | null>(null);
  const [dayTypes, setDayTypes] = useState<Record<string, DayType>>({});
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([]);
  const [weeklyHalfDays, setWeeklyHalfDays] = useState<number[]>([]);
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [dialogDate, setDialogDate] = useState<Date | null>(null);

  useEffect(() => {
    api.listAcademicSessions().then((list) => {
      setSessions(list);
      setSessionId((current) => current || list.find((s) => s.is_current)?.id || list[0]?.id || "");
    });
  }, []);

  const session = sessions.find((s) => s.id === sessionId);

  const refresh = useCallback(() => {
    if (!selectedBranchId || !session) return;
    api.getSchoolCalendar(selectedBranchId, session.id).then((data) => {
      setCalendar(data);
      setWeeklyOffDays(data.weekly_off_days);
      setWeeklyHalfDays(data.weekly_half_days);
    });
    api.getDayTypes(selectedBranchId, session.start_date.slice(0, 10), session.end_date.slice(0, 10)).then(setDayTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, session?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSaveRule = async () => {
    if (!selectedBranchId || !session) return;
    setIsSavingRule(true);
    try {
      await api.setWeeklyRule({
        branch_id: selectedBranchId,
        academic_session_id: session.id,
        weekly_off_days: weeklyOffDays,
        weekly_half_days: weeklyHalfDays,
      });
      refresh();
    } finally {
      setIsSavingRule(false);
    }
  };

  const toggleOff = (day: number) => {
    setWeeklyOffDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
    setWeeklyHalfDays((prev) => prev.filter((d) => d !== day));
  };
  const toggleHalf = (day: number) => {
    setWeeklyHalfDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
    setWeeklyOffDays((prev) => prev.filter((d) => d !== day));
  };

  const holidayDates: Date[] = [];
  const halfDayDates: Date[] = [];
  for (const [iso, dayType] of Object.entries(dayTypes)) {
    const d = parseISO(iso);
    if (dayType === "holiday") holidayDates.push(d);
    else if (dayType === "half_day") halfDayDates.push(d);
  }

  const namedHolidayByDate = new Map((calendar?.holidays ?? []).map((h) => [h.date.slice(0, 10), h]));
  const sortedHolidays = (calendar?.holidays ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));

  if (!selectedBranchId) {
    return <p className="text-muted-foreground">Select a branch to manage its calendar.</p>;
  }
  if (!session) {
    return <p className="text-muted-foreground">Create an academic session first.</p>;
  }

  const rangeStart = startOfMonth(parseISO(session.start_date.slice(0, 10)));
  const rangeEnd = endOfMonth(parseISO(session.end_date.slice(0, 10)));
  const numberOfMonths = Math.max(1, differenceInCalendarMonths(rangeEnd, rangeStart) + 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Academic session</Label>
        <Select value={sessionId} onValueChange={setSessionId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select session" />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly rule</CardTitle>
          <p className="text-sm text-muted-foreground">
            Days that are always off or always a half-day for the whole session, e.g. every Sunday off and every
            Saturday a half-day. A named date below always overrides this rule for that specific day.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Always off</p>
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_LABELS.map((label, day) => (
                  <label key={day} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={weeklyOffDays.includes(day)}
                      disabled={!canManage}
                      onChange={() => toggleOff(day)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Always half-day</p>
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_LABELS.map((label, day) => (
                  <label key={day} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={weeklyHalfDays.includes(day)}
                      disabled={!canManage}
                      onChange={() => toggleHalf(day)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {canManage && (
            <div>
              <Button onClick={handleSaveRule} disabled={isSavingRule}>
                {isSavingRule ? "Saving..." : "Save weekly rule"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calendar</CardTitle>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-destructive/25" /> Holiday
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-warning/30" /> Half-day
            </span>
            {canManage && <span>Click a date to name it as a holiday or half-day.</span>}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <DayPicker
            numberOfMonths={numberOfMonths}
            startMonth={rangeStart}
            endMonth={rangeEnd}
            defaultMonth={rangeStart}
            showOutsideDays={false}
            modifiers={{ holiday: holidayDates, halfDay: halfDayDates }}
            modifiersClassNames={{
              holiday: "!bg-destructive/20 !text-destructive rounded-md",
              halfDay: "!bg-warning/25 !text-warning-foreground rounded-md",
            }}
            onDayClick={(day) => canManage && setDialogDate(day)}
            className={canManage ? "cursor-pointer" : undefined}
            style={
              {
                "--rdp-accent-color": "var(--primary)",
                "--rdp-accent-background-color": "var(--accent)",
                "--rdp-today-color": "var(--primary)",
              } as React.CSSProperties
            }
          />
        </CardContent>
      </Card>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedHolidays.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{h.date.slice(0, 10)}</TableCell>
                <TableCell className="font-medium">{h.name}</TableCell>
                <TableCell>
                  <Badge variant={h.type === "holiday" ? "destructive" : "warning"}>
                    {h.type === "holiday" ? "Full holiday" : "Half day"}
                  </Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-1">
                  {canManage && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setDialogDate(parseISO(h.date.slice(0, 10)))}>
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (!window.confirm(`Remove holiday "${h.name}"?`)) return;
                          await api.deleteHoliday(h.id);
                          refresh();
                        }}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {sortedHolidays.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No named holidays yet for this session.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {dialogDate && (
        <HolidayDialog
          branchId={selectedBranchId}
          sessionId={session.id}
          date={dialogDate}
          existing={namedHolidayByDate.get(format(dialogDate, "yyyy-MM-dd"))}
          onClose={() => setDialogDate(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

export function AcademicSetupPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const hasPermission = useAppStore((s) => s.hasPermission);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Academic Setup</h1>
        <p className="text-muted-foreground">Academic sessions, classes, and sections for this branch.</p>
      </div>
      <Tabs defaultValue="classes">
        <TabsList>
          <TabsTrigger value="classes">Classes &amp; Sections</TabsTrigger>
          <TabsTrigger value="sessions">Academic Sessions</TabsTrigger>
          <TabsTrigger value="subjects">Subjects &amp; Electives</TabsTrigger>
          <TabsTrigger value="calendar">School Calendar</TabsTrigger>
          <TabsTrigger value="promotion">Promotion</TabsTrigger>
          {hasPermission("academic_setup.manage_school_details") && (
            <TabsTrigger value="school">School Details</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="classes">
          <ClassesAndSectionsTab key={refreshKey} />
        </TabsContent>
        <TabsContent value="sessions">
          <AcademicSessionsTab onChanged={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>
        <TabsContent value="subjects">
          <ClassSubjectsTab />
        </TabsContent>
        <TabsContent value="calendar">
          <SchoolCalendarTab />
        </TabsContent>
        <TabsContent value="promotion">
          <PromotionTab />
        </TabsContent>
        {hasPermission("academic_setup.manage_school_details") && (
          <TabsContent value="school">
            <SchoolDetailsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
