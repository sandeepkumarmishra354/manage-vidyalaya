import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon, XIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type AcademicSession, type SchoolClass, type Section } from "@/lib/api";
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
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      });
    }
  }, [branch]);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

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
                <TableCell>{s.start_date}</TableCell>
                <TableCell>{s.end_date}</TableCell>
                <TableCell>{s.is_current && <Badge>Current</Badge>}</TableCell>
                <TableCell>
                  <EditSessionDialog session={s} onUpdated={() => { refresh(); onChanged(); }} />
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
                      <button onClick={() => handleDeleteSection(sec)} className="text-muted-foreground hover:text-destructive">
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  ))}
                  {(sectionsByClass[c.id] ?? []).length === 0 && (
                    <span className="text-muted-foreground">No sections yet</span>
                  )}
                </TableCell>
                <TableCell className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleRenameClass(c)}>
                    <PencilIcon className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteClass(c)}>
                    <XIcon className="size-3.5" />
                  </Button>
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
          <TabsTrigger value="promotion">Promotion</TabsTrigger>
          {hasPermission("academic_setup.manage") && <TabsTrigger value="school">School Details</TabsTrigger>}
        </TabsList>
        <TabsContent value="classes">
          <ClassesAndSectionsTab key={refreshKey} />
        </TabsContent>
        <TabsContent value="sessions">
          <AcademicSessionsTab onChanged={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>
        <TabsContent value="promotion">
          <PromotionTab />
        </TabsContent>
        {hasPermission("academic_setup.manage") && (
          <TabsContent value="school">
            <SchoolDetailsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
