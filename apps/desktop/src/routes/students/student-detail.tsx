import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2Icon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  type AttendanceHistoryEntry,
  type House,
  type StudentDetail,
  type StudentTransportInfo,
  type TransportRoute,
  type TransportStop,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

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
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [attendance, setAttendance] = useState<AttendanceHistoryEntry[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (id) {
      api.getStudent(id).then(setStudent);
      api.getStudentAttendanceHistory(id).then(setAttendance);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {student.first_name} {student.last_name ?? ""}
        </h1>
        <Badge variant={student.status === "enrolled" ? "default" : "secondary"}>{student.status}</Badge>
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
                <Badge variant="outline">{g.relation}</Badge>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
