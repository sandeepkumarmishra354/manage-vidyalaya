import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2Icon, PencilIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  type Guardian,
  type House,
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

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["student", id] });
    queryClient.invalidateQueries({ queryKey: ["student-attendance-history", id] });
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
          <Badge variant={student.status === "enrolled" ? "default" : "secondary"}>{student.status}</Badge>
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
          <Field label="Address" value={student.address ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guardians</CardTitle>
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
                  <Badge variant="outline">{g.relation}</Badge>
                  {hasPermission("students.edit") && <EditGuardianDialog guardian={g} onUpdated={refresh} />}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {g.phone ?? "—"} {g.email ? `· ${g.email}` : ""}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

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
      </CardContent>
    </Card>
  );
}

function TransportCard({ studentId, branchId }: { studentId: string; branchId: string }) {
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
      </CardContent>
    </Card>
  );
}

function EditGuardianDialog({ guardian, onUpdated }: { guardian: Guardian; onUpdated: () => void }) {
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
        email: form.email,
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
          <div className="flex flex-col gap-1.5">
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
            <Label>Phone</Label>
            <Input value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Email</Label>
            <Input value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
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
