import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon, XIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type AcademicSession, type SchoolClass, type Section, type StaffListItem } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const NO_CLASS_TEACHER = "__none__";

export function ClassesAndSectionsTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManageClasses = hasPermission("academic_setup.manage_classes");
  const canManageSections = hasPermission("academic_setup.manage_sections");
  const canManageClassTeacher = hasPermission("staff.manage_assignments");
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, Section[]>>({});
  const [staffList, setStaffList] = useState<StaffListItem[]>([]);

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

  useEffect(() => {
    if (canManageClassTeacher && selectedBranchId) {
      api.listStaff(selectedBranchId).then((list) => setStaffList(list.filter((s) => s.status === "active")));
    }
  }, [canManageClassTeacher, selectedBranchId]);

  const handleSetClassTeacher = async (sectionId: string, staffId: string) => {
    await api.setClassTeacher({ section_id: sectionId, staff_id: staffId === NO_CLASS_TEACHER ? null : staffId });
    refreshClasses();
  };

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
                <TableCell className="flex flex-wrap gap-2">
                  {(sectionsByClass[c.id] ?? []).map((sec) => {
                    const classTeacher = staffList.find((s) => s.id === sec.class_teacher_staff_id);
                    return (
                      <div key={sec.id} className="flex flex-col gap-1 rounded-md border p-1.5">
                        <Badge variant="outline" className="w-fit gap-1">
                          {sec.name}
                          {canManageSections && (
                            <button onClick={() => handleDeleteSection(sec)} className="text-muted-foreground hover:text-destructive">
                              <XIcon className="size-3" />
                            </button>
                          )}
                        </Badge>
                        {canManageClassTeacher ? (
                          <Select
                            value={sec.class_teacher_staff_id ?? NO_CLASS_TEACHER}
                            onValueChange={(v) => handleSetClassTeacher(sec.id, v)}
                          >
                            <SelectTrigger size="sm" className="h-6 w-40 text-xs">
                              <SelectValue placeholder="Class teacher" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_CLASS_TEACHER}>No class teacher</SelectItem>
                              {staffList.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.first_name} {s.last_name ?? ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          classTeacher && (
                            <span className="text-xs text-muted-foreground">
                              {classTeacher.first_name} {classTeacher.last_name ?? ""}
                            </span>
                          )
                        )}
                      </div>
                    );
                  })}
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
