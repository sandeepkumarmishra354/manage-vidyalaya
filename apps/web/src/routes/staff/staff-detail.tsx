import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  BriefcaseIcon,
  CalendarCheckIcon,
  CalendarOffIcon,
  IdCardIcon,
  KeyIcon,
  LandmarkIcon,
  PhoneIcon,
  PlusIcon,
  UserIcon,
  UserPlusIcon,
} from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  type SchoolClass,
  type Section,
  type Staff,
  type StaffCategory,
  type StaffLeaveRequestListItem,
  type StaffLeaveStatus,
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
import { formatDate } from "@/lib/date";
import { DetailSection } from "@/components/detail-section";
import { PersonAttendanceCalendar } from "@/components/person-attendance-calendar";
import { ProfileHeader } from "@/components/profile-header";
import { EditStaffDialog } from "./edit-staff-dialog";
import { SalaryStructureTab } from "./salary-structure-tab";

export function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const hasPermission = useAppStore((s) => s.hasPermission);
  const branches = useAppStore((s) => s.branches);
  const [staff, setStaff] = useState<Staff | null>(null);

  const refresh = useCallback(() => {
    if (id) {
      api.getStaff(id).then(setStaff);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!staff) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader
        icon={BriefcaseIcon}
        accent="var(--color-staff)"
        name={`${staff.first_name} ${staff.last_name ?? ""}`}
        status={staff.status}
        statusVariant={staff.status === "active" ? "success" : "secondary"}
        facts={[
          { label: "Employee code", value: staff.employee_code },
          { label: "Designation", value: staff.designation },
          { label: "Branch", value: branches.find((b) => b.id === staff.branch_id)?.name ?? "—" },
        ]}
        actions={hasPermission("staff.manage_profile") ? <EditStaffDialog staff={staff} onUpdated={refresh} /> : undefined}
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          {hasPermission("payroll.view") && <TabsTrigger value="salary">Salary</TabsTrigger>}
          {hasPermission("staff_leave.manage") && <TabsTrigger value="leave">Leave</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab staff={staff} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="assignments">
          <AssignmentsTab staff={staff} />
        </TabsContent>
        <TabsContent value="attendance">
          <DetailSection title="Attendance calendar" icon={CalendarCheckIcon} accent="var(--color-staff)">
            <PersonAttendanceCalendar personType="staff" branchId={staff.branch_id} personId={staff.id} />
          </DetailSection>
        </TabsContent>
        {hasPermission("payroll.view") && (
          <TabsContent value="salary">
            <SalaryStructureTab staffId={staff.id} branchId={staff.branch_id} dateOfJoining={staff.date_of_joining} />
          </TabsContent>
        )}
        {hasPermission("staff_leave.manage") && (
          <TabsContent value="leave">
            <StaffLeaveTab staff={staff} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

const LEAVE_STATUS_VARIANT: Record<StaffLeaveStatus, "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "secondary",
};

function AddLeaveDialog({ staff, onAdded }: { staff: Staff; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.fileStaffLeave({ staff_id: staff.id, start_date: startDate, end_date: endDate, reason: reason || null });
      setStartDate("");
      setEndDate("");
      setReason("");
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusIcon />
          Add leave
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add leave for {staff.first_name}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <p className="text-sm text-muted-foreground">
            Filed by HR, so it's recorded as approved immediately and reflected on the attendance calendar.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-leave-start">Start date</Label>
              <Input id="add-leave-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-leave-end">End date</Label>
              <Input id="add-leave-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-leave-reason">Reason (optional)</Label>
            <Input id="add-leave-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Add leave"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StaffLeaveTab({ staff }: { staff: Staff }) {
  const [requests, setRequests] = useState<StaffLeaveRequestListItem[]>([]);

  const refresh = useCallback(() => {
    api.listStaffLeave(staff.branch_id).then((all) => setRequests(all.filter((r) => r.staff_id === staff.id)));
  }, [staff.branch_id, staff.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <DetailSection
      title="Leave history"
      icon={CalendarOffIcon}
      accent="var(--color-staff)"
      actions={<AddLeaveDialog staff={staff} onAdded={refresh} />}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dates</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                {formatDate(r.start_date)}
                {r.start_date !== r.end_date ? ` – ${formatDate(r.end_date)}` : ""}
              </TableCell>
              <TableCell>{r.reason ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={LEAVE_STATUS_VARIANT[r.status]}>{r.status}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{r.decision_note ?? "—"}</TableCell>
            </TableRow>
          ))}
          {requests.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                No leave records yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </DetailSection>
  );
}

function ProfileTab({ staff, onChanged }: { staff: Staff; onChanged: () => void }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [categories, setCategories] = useState<StaffCategory[]>([]);

  useEffect(() => {
    api.listStaffCategories().then(setCategories);
  }, []);

  const categoryName = categories.find((c) => c.id === staff.category_id)?.name ?? "—";

  return (
    <div className="flex flex-col gap-4">
      <DetailSection
        title="Personal details"
        icon={UserIcon}
        accent="var(--color-staff)"
        fields={[
          { label: "Date of birth", value: staff.date_of_birth ? formatDate(staff.date_of_birth) : "—" },
          { label: "Gender", value: staff.gender ?? "—" },
          { label: "Blood group", value: staff.blood_group ?? "—" },
          ...(staff.notes ? [{ label: "Notes", value: staff.notes, span: true }] : []),
        ]}
      />

      <DetailSection
        title="Employment"
        icon={BriefcaseIcon}
        accent="var(--color-staff)"
        fields={[
          { label: "Employee code", value: staff.employee_code },
          { label: "Designation", value: staff.designation },
          { label: "Category", value: categoryName },
          { label: "Department", value: staff.department ?? "—" },
          { label: "Employment type", value: staff.employment_type },
          { label: "Date of joining", value: formatDate(staff.date_of_joining) },
          { label: "Date of leaving", value: staff.date_of_leaving ? formatDate(staff.date_of_leaving) : "—" },
          { label: "Qualification", value: staff.qualification ?? "—" },
        ]}
      />

      <DetailSection
        title="Contact"
        icon={PhoneIcon}
        accent="var(--color-staff)"
        fields={[
          { label: "Phone", value: staff.phone ?? "—" },
          { label: "Personal email", value: staff.personal_email ?? "—" },
          { label: "Address", value: staff.address ?? "—" },
          {
            label: "City / State / Pincode",
            value: [staff.city, staff.state, staff.pincode].filter(Boolean).join(", ") || "—",
          },
          { label: "Emergency contact", value: staff.emergency_contact_name ?? "—" },
          { label: "Emergency contact phone", value: staff.emergency_contact_phone ?? "—" },
        ]}
      />

      <DetailSection
        title="Statutory & bank"
        icon={LandmarkIcon}
        accent="var(--color-staff)"
        fields={[
          { label: "PAN", value: staff.pan_number ?? "—" },
          { label: "Aadhaar number", value: staff.aadhaar_number ?? "—" },
          { label: "PF number", value: staff.pf_number ?? "—" },
          { label: "ESI number", value: staff.esi_number ?? "—" },
          { label: "UAN", value: staff.uan_number ?? "—" },
          { label: "Bank", value: staff.bank_name ?? "—" },
          { label: "Account #", value: staff.bank_account_number ?? "—" },
          { label: "IFSC", value: staff.bank_ifsc ?? "—" },
        ]}
      />

      {hasPermission("users.manage") && (
        <DetailSection title="Login access" icon={IdCardIcon} accent="var(--color-staff)">
          {staff.user_id ? (
            <ResetPasswordDialog userId={staff.user_id} />
          ) : (
            <CreateLoginDialog staff={staff} onCreated={onChanged} />
          )}
        </DetailSection>
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
  const [classTeacherError, setClassTeacherError] = useState<string | null>(null);

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
    setClassTeacherError(null);
    try {
      await api.setClassTeacher({ section_id: sectionId, staff_id: staff.id });
      refresh();
    } catch (err) {
      setClassTeacherError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {hasPermission("staff.manage_assignments") && (
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
            {classTeacherError && <p className="w-full text-sm text-destructive">{classTeacherError}</p>}
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
                  {hasPermission("staff.manage_assignments") && (
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

