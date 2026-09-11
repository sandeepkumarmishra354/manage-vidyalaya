import { useCallback, useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type AcademicSession, type SchoolClass, type Section } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.start_date}</TableCell>
                <TableCell>{s.end_date}</TableCell>
                <TableCell>{s.is_current && <Badge>Current</Badge>}</TableCell>
              </TableRow>
            ))}
            {sessions.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {classes.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="flex flex-wrap gap-1.5">
                  {(sectionsByClass[c.id] ?? []).map((sec) => (
                    <Badge key={sec.id} variant="outline">
                      {sec.name}
                    </Badge>
                  ))}
                  {(sectionsByClass[c.id] ?? []).length === 0 && (
                    <span className="text-muted-foreground">No sections yet</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {classes.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Academic Setup</h1>
        <p className="text-muted-foreground">
          Academic sessions, classes, and sections -- shared across all branches and synced like
          everything else.
        </p>
      </div>
      <Tabs defaultValue="classes">
        <TabsList>
          <TabsTrigger value="classes">Classes &amp; Sections</TabsTrigger>
          <TabsTrigger value="sessions">Academic Sessions</TabsTrigger>
        </TabsList>
        <TabsContent value="classes">
          <ClassesAndSectionsTab key={refreshKey} />
        </TabsContent>
        <TabsContent value="sessions">
          <AcademicSessionsTab onChanged={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
