import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2Icon, PencilIcon, UsersIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  type House,
  type StudentGuardianLink,
  type StudentTransportInfo,
  type TransportRoute,
  type TransportStop,
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
import { Separator } from "@/components/ui/separator";
import { AddGuardianDialog } from "./add-guardian-dialog";
import { EditStudentDialog } from "./edit-student-dialog";

const attendanceBadgeVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  present: "default",
  absent: "destructive",
  late: "secondary",
  half_day: "secondary",
  leave: "outline",
};

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isModuleEnabled = useAppStore((s) => s.isModuleEnabled);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: student } = useQuery({
    queryKey: ["student", id],
    queryFn: () => api.getStudent(id!),
    enabled: !!id,
  });
  const { data: attendance = [] } = useQuery({
    queryKey: ["student-attendance-history", id],
    queryFn: () => api.getStudentAttendanceHistory(id!),
    enabled: !!id,
  });
  const { data: siblings = [] } = useQuery({
    queryKey: ["student-siblings", id],
    queryFn: () => api.getSiblings(id!),
    enabled: !!id,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["student", id] });
    queryClient.invalidateQueries({ queryKey: ["student-attendance-history", id] });
    queryClient.invalidateQueries({ queryKey: ["student-siblings", id] });
  };

  const handleConfirm = async () => {
    if (!id) return;
    setIsConfirming(true);
    setConfirmError(null);
    try {
      const admission = await api.getAdmissionForStudent(id);
      if (!admission) throw new Error("No admission record found for this student.");
      await api.confirmAdmission(admission.id);
      refresh();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsConfirming(false);
    }
  };

  if (!student) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {student.first_name} {student.last_name ?? ""}
          </h1>
          <Badge variant={student.status === "enrolled" ? "success" : "secondary"}>{student.status}</Badge>
        </div>
        {hasPermission("students.edit") && (
          <EditStudentDialog student={student} branchId={student.branch_id} onUpdated={refresh} />
        )}
      </div>

      {student.status === "applied" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div>
              <p className="font-medium">Admission not yet confirmed</p>
              <p className="text-sm text-muted-foreground">
                Confirm to assign an admission number and make this student eligible for
                attendance, fees, and exams.
              </p>
              {confirmError && <p className="mt-1 text-sm text-destructive">{confirmError}</p>}
            </div>
            <Button onClick={handleConfirm} disabled={isConfirming}>
              <CheckCircle2Icon />
              {isConfirming ? "Confirming..." : "Confirm admission"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
          <Field label="Admission number" value={student.admission_number ?? "Not yet assigned"} />
          <Field label="Date of birth" value={student.date_of_birth ?? "—"} />
          <Field label="Gender" value={student.gender ?? "—"} />
          <Field label="Blood group" value={student.blood_group ?? "—"} />
          <Field label="Address" value={student.address ?? "—"} />
          <Field
            label="City / State / Pincode"
            value={[student.city, student.state, student.pincode].filter(Boolean).join(", ") || "—"}
          />
          <Field label="Category" value={student.category ?? "—"} />
          <Field label="Religion" value={student.religion ?? "—"} />
          <Field label="Nationality" value={student.nationality ?? "—"} />
          <Field label="Mother tongue" value={student.mother_tongue ?? "—"} />
          <Field label="Aadhaar number" value={student.aadhaar_number ?? "—"} />
          <Field label="Previous school" value={student.previous_school_name ?? "—"} />
          <Field label="Emergency contact" value={student.emergency_contact_name ?? "—"} />
          <Field label="Emergency contact phone" value={student.emergency_contact_phone ?? "—"} />
          {student.medical_notes && (
            <div className="col-span-2">
              <Field label="Medical notes" value={student.medical_notes} />
            </div>
          )}
          {student.notes && (
            <div className="col-span-2">
              <Field label="Notes" value={student.notes} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Guardians</CardTitle>
          {hasPermission("students.edit") && <AddGuardianDialog studentId={student.id} onAdded={refresh} />}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {student.guardians.length === 0 && (
            <p className="text-muted-foreground">No guardians on record.</p>
          )}
          {student.guardians.map((g, i) => (
            <div key={g.id}>
              {i > 0 && <Separator className="my-3" />}
              <div className="flex items-center justify-between">
                <p className="font-medium">{g.full_name}</p>
                <div className="flex items-center gap-2">
                  {g.is_primary_contact && <Badge variant="success">Primary</Badge>}
                  <Badge variant="outline">{g.relation}</Badge>
                  {hasPermission("students.edit") && <EditGuardianDialog guardian={g} onUpdated={refresh} />}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {g.phone ?? "—"}
                {g.alt_phone ? ` · alt: ${g.alt_phone}` : ""}
                {g.email ? ` · ${g.email}` : ""}
                {g.occupation ? ` · ${g.occupation}` : ""}
              </p>
              {g.address && <p className="text-sm text-muted-foreground">{g.address}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      {siblings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersIcon className="size-4 text-academics" />
              Siblings
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {siblings.map((s) => (
              <Link
                key={s.id}
                to={`/students/${s.id}`}
                className="flex items-center justify-between rounded-md p-2 text-sm hover:bg-accent"
              >
                <span className="font-medium">
                  {s.first_name} {s.last_name ?? ""}
                </span>
                <span className="text-muted-foreground">
                  {[s.class_name, s.section_name].filter(Boolean).join(" · ") || s.admission_number || "—"}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {student.status === "enrolled" && isModuleEnabled("houses") && (
        <HouseCard studentId={student.id} branchId={student.branch_id} />
      )}

      {student.status === "enrolled" && isModuleEnabled("transport") && (
        <TransportCard studentId={student.id} branchId={student.branch_id} />
      )}

      {attendance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent attendance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {attendance.slice(0, 30).map((a) => (
              <Badge key={a.attendance_date} variant={attendanceBadgeVariant[a.status] ?? "outline"} title={a.attendance_date}>
                {a.attendance_date.slice(5)} · {a.status}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HouseCard({ studentId, branchId }: { studentId: string; branchId: string }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canAssign = hasPermission("houses.manage_teams");
  const [houses, setHouses] = useState<House[]>([]);
  const [currentHouse, setCurrentHouse] = useState<House | null>(null);

  useEffect(() => {
    api.listHouses(branchId).then(setHouses);
    api.getStudentHouse(studentId).then(setCurrentHouse);
  }, [branchId, studentId]);

  const handleAssign = async (houseId: string) => {
    await api.assignStudentHouse(studentId, houseId);
    setCurrentHouse(houses.find((h) => h.id === houseId) ?? null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">House</CardTitle>
      </CardHeader>
      <CardContent>
        {canAssign ? (
          <Select value={currentHouse?.id ?? undefined} onValueChange={handleAssign}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Assign a house" />
            </SelectTrigger>
            <SelectContent>
              {houses.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">{currentHouse?.name ?? "Not assigned"}</p>
        )}
      </CardContent>
    </Card>
  );
}

function TransportCard({ studentId, branchId }: { studentId: string; branchId: string }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canAssign = hasPermission("transport.manage_assignments");
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [stops, setStops] = useState<TransportStop[]>([]);
  const [routeId, setRouteId] = useState("");
  const [current, setCurrent] = useState<StudentTransportInfo | null>(null);

  useEffect(() => {
    api.listRoutes(branchId).then(setRoutes);
    api.getStudentTransport(studentId).then(setCurrent);
  }, [branchId, studentId]);

  useEffect(() => {
    if (routeId) api.listStops(routeId).then(setStops);
  }, [routeId]);

  const handleAssign = async (stopId: string) => {
    await api.assignStudentTransport(studentId, routeId, stopId);
    const info = await api.getStudentTransport(studentId);
    setCurrent(info);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transport</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {current && (
          <p className="text-sm text-muted-foreground">
            Currently on <span className="font-medium text-foreground">{current.route_name}</span>, stop{" "}
            <span className="font-medium text-foreground">{current.stop_name}</span>
            {current.pickup_time ? ` (${current.pickup_time})` : ""}
          </p>
        )}
        {canAssign && (
          <div className="flex gap-3">
            <Select value={routeId} onValueChange={setRouteId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select route" />
              </SelectTrigger>
              <SelectContent>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select disabled={!routeId} onValueChange={handleAssign}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select stop" />
              </SelectTrigger>
              <SelectContent>
                {stops.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {!canAssign && !current && <p className="text-sm text-muted-foreground">Not assigned</p>}
      </CardContent>
    </Card>
  );
}

function EditGuardianDialog({ guardian, onUpdated }: { guardian: StudentGuardianLink; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(guardian);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) setForm(guardian);
  }, [open, guardian]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.updateGuardian({
        id: guardian.id,
        full_name: form.full_name,
        relation: form.relation,
        phone: form.phone,
        alt_phone: form.alt_phone,
        email: form.email,
        occupation: form.occupation,
        address: form.address,
        aadhaar_number: form.aadhaar_number,
        annual_income: form.annual_income,
      });
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
        <DialogHeader><DialogTitle>Edit guardian</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Full name</Label>
              <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Relation</Label>
              <Select value={form.relation ?? undefined} onValueChange={(v) => setForm((f) => ({ ...f, relation: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="father">Father</SelectItem>
                  <SelectItem value="mother">Mother</SelectItem>
                  <SelectItem value="guardian">Guardian</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Occupation</Label>
              <Input value={form.occupation ?? ""} onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Alternate phone</Label>
              <Input value={form.alt_phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, alt_phone: e.target.value }))} />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Address</Label>
              <Input value={form.address ?? ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Aadhaar number</Label>
              <Input value={form.aadhaar_number ?? ""} onChange={(e) => setForm((f) => ({ ...f, aadhaar_number: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Annual income (₹)</Label>
              <Input
                type="number"
                value={form.annual_income ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, annual_income: e.target.value ? Number(e.target.value) : null }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
