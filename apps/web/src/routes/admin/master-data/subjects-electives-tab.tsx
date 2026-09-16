import { useCallback, useEffect, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type ClassSubject, type ElectiveGroup, type SchoolClass, type Subject } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SubjectsElectivesTab() {
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
