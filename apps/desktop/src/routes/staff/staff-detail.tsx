import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { KeyIcon, UserPlusIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  type SchoolClass,
  type Section,
  type Staff,
  type StaffAttendanceHistoryEntry,
  type Subject,
  type TeacherAssignment,
} from "@/lib/api";
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
import { EditStaffDialog } from "./edit-staff-dialog";
import { SalaryStructureTab } from "./salary-structure-tab";

const attendanceBadgeVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  present: "default",
  absent: "destructive",
  half_day: "secondary",
  leave: "outline",
  holiday: "outline",
};

export function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [attendance, setAttendance] = useState<StaffAttendanceHistoryEntry[]>([]);

  const refresh = useCallback(() => {
    if (id) {
      api.getStaff(id).then(setStaff);
      api.getStaffAttendanceHistory(id).then(setAttendance);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!staff) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {staff.first_name} {staff.last_name ?? ""}
          </h1>
          <Badge variant={staff.status === "active" ? "default" : "secondary"}>{staff.status}</Badge>
        </div>
        {hasPermission("staff.manage") && <EditStaffDialog staff={staff} onUpdated={refresh} />}
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab staff={staff} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="assignments">
          <AssignmentsTab staff={staff} />
        </TabsContent>
        <TabsContent value="attendance">
          <div className="flex flex-wrap gap-1.5">
            {attendance.map((a) => (
              <Badge key={a.attendance_date} variant={attendanceBadgeVariant[a.status] ?? "outline"} title={a.attendance_date}>
                {a.attendance_date.slice(5)} · {a.status}
              </Badge>
            ))}
            {attendance.length === 0 && <p className="text-muted-foreground">No attendance recorded yet.</p>}
          </div>
        </TabsContent>
        <TabsContent value="salary">
          <SalaryStructureTab staffId={staff.id} branchId={staff.branch_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileTab({ staff, onChanged }: { staff: Staff; onChanged: () => void }) {
  const hasPermission = useAppStore((s) => s.hasPermission);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employment</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
          <Field label="Employee code" value={staff.employee_code} />
          <Field label="Designation" value={staff.designation} />
          <Field label="Department" value={staff.department ?? "—"} />
          <Field label="Employment type" value={staff.employment_type} />
          <Field label="Date of joining" value={staff.date_of_joining} />
          <Field label="Qualification" value={staff.qualification ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
          <Field label="Phone" value={staff.phone ?? "—"} />
          <Field label="Personal email" value={staff.personal_email ?? "—"} />
          <Field label="Address" value={staff.address ?? "—"} />
          <Field label="Emergency contact" value={staff.emergency_contact_name ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statutory &amp; bank</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
          <Field label="PAN" value={staff.pan_number ?? "—"} />
          <Field label="PF number" value={staff.pf_number ?? "—"} />
          <Field label="ESI number" value={staff.esi_number ?? "—"} />
          <Field label="UAN" value={staff.uan_number ?? "—"} />
          <Field label="Bank" value={staff.bank_name ?? "—"} />
          <Field label="Account #" value={staff.bank_account_number ?? "—"} />
        </CardContent>
      </Card>

      {hasPermission("users.manage") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Login access</CardTitle>
          </CardHeader>
          <CardContent>
            {staff.user_id ? (
              <ResetPasswordDialog userId={staff.user_id} />
            ) : (
              <CreateLoginDialog staff={staff} onCreated={onChanged} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CreateLoginDialog({ staff, onCreated }: { staff: Staff; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(staff.personal_email ?? "");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.createStaffLogin({
        staff_id: staff.id,
        email,
        full_name: `${staff.first_name} ${staff.last_name ?? ""}`.trim(),
        initial_password: password,
        branch_id: staff.branch_id,
      });
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlusIcon />
          Create login
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a login for {staff.first_name}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <p className="text-sm text-muted-foreground">Requires an internet connection.</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-password">Initial password</Label>
            <Input
              id="login-password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create login"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.resetStaffPassword({ user_id: userId, new_password: password });
      setDone(true);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setDone(false); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <KeyIcon />
          Reset password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
        </DialogHeader>
        {done ? (
          <p className="text-sm text-emerald-600">Password reset. Share the new password with the staff member securely.</p>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <p className="text-sm text-muted-foreground">Requires an internet connection.</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-password">New password</Label>
              <Input
                id="reset-password"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Resetting..." : "Reset password"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AssignmentsTab({ staff }: { staff: Staff }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [sessionId, setSessionId] = useState("");

  const refresh = useCallback(() => {
    api.listTeacherAssignments(staff.branch_id, staff.id).then(setAssignments);
  }, [staff.branch_id, staff.id]);

  useEffect(() => {
    refresh();
    api.listClasses(staff.branch_id).then(setClasses);
    api.listSubjects(staff.branch_id).then(setSubjects);
    api.listAcademicSessions().then((s) => {
      const current = s.find((x) => x.is_current);
      if (current) setSessionId(current.id);
    });
  }, [staff.branch_id, refresh]);

  useEffect(() => {
    if (classId) api.listSections(classId).then(setSections);
    else setSections([]);
  }, [classId]);

  const handleAdd = async () => {
    if (!classId || !subjectId || !sessionId) return;
    await api.createTeacherAssignment({
      branch_id: staff.branch_id,
      staff_id: staff.id,
      class_id: classId,
      section_id: sectionId || null,
      subject_id: subjectId,
      academic_session_id: sessionId,
    });
    setSubjectId("");
    refresh();
  };

  const handleSetClassTeacher = async () => {
    if (!sectionId) return;
    await api.setClassTeacher({ section_id: sectionId, staff_id: staff.id });
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      {hasPermission("staff.manage") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assign a subject</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Section (optional)</Label>
              <Select value={sectionId} onValueChange={setSectionId} disabled={sections.length === 0}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Subject</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Subject" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={!classId || !subjectId}>Add</Button>
            {sectionId && (
              <Button variant="outline" onClick={handleSetClassTeacher}>Make class teacher of this section</Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.class_name}</TableCell>
                <TableCell>{a.section_name ?? "All"}</TableCell>
                <TableCell>{a.subject_name}</TableCell>
                <TableCell className="text-right">
                  {hasPermission("staff.manage") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => { await api.deleteTeacherAssignment(a.id); refresh(); }}
                    >
                      Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {assignments.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No subject/class assignments yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
