import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CalendarCheckIcon,
  CheckCircle2Icon,
  GraduationCapIcon,
  PencilIcon,
  ReceiptIndianRupeeIcon,
  StarIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  FEE_TYPE_LABELS,
  type AcademicSession,
  type ElectiveGroup,
  type House,
  type InvoiceStatus,
  type StudentDiscount,
  type StudentElectiveChoice,
  type StudentFeeAssignment,
  type StudentFeeSummary,
  type StudentGuardianLink,
  type StudentTransportInfo,
  type TransportRoute,
  type TransportStop,
} from "@/lib/api";
import { ReprintReceiptDialog } from "@/components/reprint-receipt-dialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/date";
import { formatPaise } from "@/lib/money";
import { DetailSection } from "@/components/detail-section";
import { DocumentsTab } from "@/components/documents-tab";
import { MasterDataSelect } from "@/components/master-data-select";
import { PersonAttendanceCalendar } from "@/components/person-attendance-calendar";
import { PersonIdTab } from "@/components/person-id-tab";
import { PersonLink } from "@/components/person-link";
import { ProfileHeader } from "@/components/profile-header";
import { AddGuardianDialog } from "./add-guardian-dialog";
import { EditStudentDialog } from "./edit-student-dialog";
import { TransferCertificateDialog } from "./transfer-certificate-dialog";

const feeStatusVariant: Record<InvoiceStatus, "info" | "warning" | "success" | "destructive" | "secondary"> = {
  pending: "info",
  partial: "warning",
  paid: "success",
  overdue: "destructive",
  waived: "secondary",
  voided: "destructive",
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
  const { data: siblings = [] } = useQuery({
    queryKey: ["student-siblings", id],
    queryFn: () => api.getSiblings(id!),
    enabled: !!id,
  });
  const canViewFees = hasPermission("fees.view");
  const { data: feeSummary } = useQuery({
    queryKey: ["student-fee-summary", id],
    queryFn: () => api.getStudentFeeSummary(id!),
    enabled: !!id && canViewFees,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["student", id] });
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
    <div className="flex flex-col gap-6">
      <ProfileHeader
        icon={GraduationCapIcon}
        accent="var(--color-academics)"
        name={`${student.first_name} ${student.last_name ?? ""}`}
        status={student.status}
        statusVariant={student.status === "enrolled" ? "success" : "secondary"}
        facts={[
          { label: "Admission #", value: student.admission_number ?? "Not yet assigned" },
          ...(student.roll_number ? [{ label: "Roll #", value: student.roll_number }] : []),
          {
            label: "Class",
            value: student.class_name
              ? `${student.class_name}${student.section_name ? ` ${student.section_name}` : ""}`
              : "Not assigned",
          },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {hasPermission("students.edit") && <TransferCertificateDialog studentId={student.id} />}
            {hasPermission("students.edit") && (
              <EditStudentDialog student={student} branchId={student.branch_id} onUpdated={refresh} />
            )}
          </div>
        }
      />

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

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="guardians">Guardians &amp; Family</TabsTrigger>
          <TabsTrigger value="academic">Academic</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          {canViewFees && <TabsTrigger value="fees">Fees</TabsTrigger>}
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="id-qr">ID / QR Code</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <DetailSection
            title="Student details"
            icon={UserIcon}
            accent="var(--color-academics)"
            fields={[
              { label: "Date of birth", value: student.date_of_birth ? formatDate(student.date_of_birth) : "—" },
              { label: "Gender", value: student.gender ?? "—" },
              { label: "Blood group", value: student.blood_group ?? "—" },
              { label: "Address", value: student.address ?? "—" },
              {
                label: "City / State / Pincode",
                value: [student.city, student.state, student.pincode].filter(Boolean).join(", ") || "—",
              },
              { label: "Category", value: student.category ?? "—" },
              { label: "Religion", value: student.religion ?? "—" },
              { label: "Nationality", value: student.nationality ?? "—" },
              { label: "Mother tongue", value: student.mother_tongue ?? "—" },
              { label: "Aadhaar number", value: student.aadhaar_number ?? "—" },
              { label: "Previous school", value: student.previous_school_name ?? "—" },
              { label: "Emergency contact", value: student.emergency_contact_name ?? "—" },
              { label: "Emergency contact phone", value: student.emergency_contact_phone ?? "—" },
              ...(student.medical_notes ? [{ label: "Medical notes", value: student.medical_notes, span: true }] : []),
              ...(student.notes ? [{ label: "Notes", value: student.notes, span: true }] : []),
            ]}
          />

          {student.status === "alumni" && (
            <DetailSection
              title="Alumni details"
              icon={StarIcon}
              accent="var(--color-academics)"
              fields={[
                { label: "Graduation year", value: student.graduation_year ?? "—" },
                { label: "Higher education", value: student.higher_education ?? "—" },
                { label: "Current occupation", value: student.current_occupation ?? "—" },
                { label: "Contact email", value: student.alumni_contact_email ?? "—" },
                ...(student.alumni_notes ? [{ label: "Notes", value: student.alumni_notes, span: true }] : []),
              ]}
            />
          )}
        </TabsContent>

        <TabsContent value="guardians" className="flex flex-col gap-4">
          <DetailSection
            title="Guardians"
            icon={UsersIcon}
            accent="var(--color-academics)"
            actions={hasPermission("students.edit") ? <AddGuardianDialog studentId={student.id} onAdded={refresh} /> : undefined}
          >
            <div className="flex flex-col gap-3">
              {student.guardians.length === 0 && <p className="text-muted-foreground">No guardians on record.</p>}
              {student.guardians.map((g, i) => (
                <div key={g.id}>
                  {i > 0 && <Separator className="my-3" />}
                  <div className="flex items-center justify-between">
                    <p className="font-medium">
                      <PersonLink type="guardian" id={g.id} name={g.full_name} />
                    </p>
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
                  {(g.aadhaar_number || g.annual_income != null) && (
                    <p className="text-sm text-muted-foreground">
                      {g.aadhaar_number ? `Aadhaar: ${g.aadhaar_number}` : ""}
                      {g.aadhaar_number && g.annual_income != null ? " · " : ""}
                      {g.annual_income != null
                        ? `Annual income: ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(g.annual_income)}`
                        : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </DetailSection>

          {siblings.length > 0 && (
            <DetailSection title="Siblings" icon={UsersIcon} accent="var(--color-academics)">
              <div className="flex flex-col gap-2">
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
              </div>
            </DetailSection>
          )}
        </TabsContent>

        <TabsContent value="academic" className="flex flex-col gap-4">
          {student.status === "enrolled" && isModuleEnabled("houses") && (
            <HouseCard studentId={student.id} branchId={student.branch_id} />
          )}
          {student.status === "enrolled" && isModuleEnabled("transport") && (
            <TransportCard studentId={student.id} branchId={student.branch_id} />
          )}
          {student.status === "enrolled" && student.current_class_id && (
            <ElectivesCard studentId={student.id} classId={student.current_class_id} />
          )}
          {!(student.status === "enrolled" && (isModuleEnabled("houses") || isModuleEnabled("transport") || student.current_class_id)) && (
            <p className="text-muted-foreground">Nothing to show until this student is enrolled.</p>
          )}
        </TabsContent>

        <TabsContent value="attendance">
          <DetailSection title="Attendance calendar" icon={CalendarCheckIcon} accent="var(--color-academics)">
            {student.current_class_id ? (
              <PersonAttendanceCalendar
                personType="student"
                branchId={student.branch_id}
                personId={student.id}
                classId={student.current_class_id}
                sectionId={student.current_section_id}
              />
            ) : (
              <p className="text-muted-foreground">Attendance requires a class assignment.</p>
            )}
          </DetailSection>
        </TabsContent>

        {canViewFees && (
          <TabsContent value="fees">
            <FeesTab summary={feeSummary} studentId={student.id} canManage={hasPermission("fees.manage_structures")} />
          </TabsContent>
        )}

        <TabsContent value="documents">
          <DocumentsTab ownerType="student" ownerId={student.id} canManage={hasPermission("students.edit")} />
        </TabsContent>

        <TabsContent value="id-qr">
          <PersonIdTab
            ownerType="student"
            ownerId={student.id}
            name={`${student.first_name} ${student.last_name ?? ""}`.trim()}
            canManage={hasPermission("students.edit")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FeeOverridesSection({ studentId, canManage }: { studentId: string; canManage: boolean }) {
  const [assignments, setAssignments] = useState<StudentFeeAssignment[]>([]);

  const refresh = useCallback(() => {
    api.listStudentFeeAssignments(studentId).then(setAssignments);
  }, [studentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (assignments.length === 0) return null;

  const handleRemove = async (id: string) => {
    await api.removeStudentFeeAssignment(id);
    refresh();
  };

  return (
    <DetailSection title="Fee structure overrides" icon={ReceiptIndianRupeeIcon} accent="var(--color-finance)">
      <div className="flex flex-col gap-2">
        {assignments.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <div>
              <span className="font-medium">{a.fee_structure_name}</span>{" "}
              <Badge variant={a.mode === "include" ? "success" : "destructive"}>{a.mode}</Badge>
              {a.reason && <span className="ml-2 text-muted-foreground">{a.reason}</span>}
            </div>
            {canManage && (
              <Button variant="ghost" size="sm" onClick={() => handleRemove(a.id)}>
                Remove
              </Button>
            )}
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

function FeeDiscountsSection({ studentId }: { studentId: string }) {
  const [discounts, setDiscounts] = useState<StudentDiscount[]>([]);

  useEffect(() => {
    api.listStudentFeeDiscounts(studentId).then(setDiscounts);
  }, [studentId]);

  if (discounts.length === 0) return null;

  return (
    <DetailSection title="Discounts" icon={ReceiptIndianRupeeIcon} accent="var(--color-finance)">
      <div className="flex flex-col gap-2">
        {discounts.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <span className="font-medium">{d.fee_discount_name}</span>
            <span className="text-muted-foreground">
              {d.discount_type === "percentage" ? `${d.value}%` : formatPaise(d.value)}
              {d.reason ? ` -- ${d.reason}` : ""}
            </span>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

function FeesTab({
  summary,
  studentId,
  canManage,
}: {
  summary?: StudentFeeSummary;
  studentId: string;
  canManage: boolean;
}) {
  if (!summary) {
    return <p className="text-muted-foreground">Loading...</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total due</p>
            <p className="text-2xl font-bold">{formatPaise(summary.total_due)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total paid</p>
            <p className="text-2xl font-bold">{formatPaise(summary.total_paid)}</p>
          </CardContent>
        </Card>
      </div>
      <FeeOverridesSection studentId={studentId} canManage={canManage} />
      <FeeDiscountsSection studentId={studentId} />
      <DetailSection title="Invoices" icon={ReceiptIndianRupeeIcon} accent="var(--color-finance)">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>{inv.fee_structure_name}</TableCell>
                <TableCell>{FEE_TYPE_LABELS[inv.fee_type] ?? inv.fee_type}</TableCell>
                <TableCell>{formatPaise(inv.amount_due)}</TableCell>
                <TableCell>{formatPaise(inv.amount_paid)}</TableCell>
                <TableCell>
                  <Badge variant={feeStatusVariant[inv.status]}>{inv.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {summary.invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  No invoices yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DetailSection>
      {summary.payments.length > 0 && (
        <DetailSection title="Payment history" icon={ReceiptIndianRupeeIcon} accent="var(--color-finance)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Receipt #</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.payment_date)}</TableCell>
                  <TableCell>{formatPaise(p.amount)}</TableCell>
                  <TableCell className="capitalize">{p.payment_method.replace("_", " ")}</TableCell>
                  <TableCell>{p.receipt_number ?? "—"}</TableCell>
                  <TableCell>{p.receipt_number && <ReprintReceiptDialog receiptNumber={p.receipt_number} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DetailSection>
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
  const [stopId, setStopId] = useState("");
  const [current, setCurrent] = useState<StudentTransportInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listRoutes(branchId).then(setRoutes);
    api.getStudentTransport(studentId).then(setCurrent);
  }, [branchId, studentId]);

  useEffect(() => {
    setStopId("");
    if (routeId) api.listStops(routeId).then(setStops);
  }, [routeId]);

  const handleAssign = async (newStopId: string) => {
    setError(null);
    try {
      await api.assignStudentTransport(studentId, routeId, newStopId);
      setStopId(newStopId);
      const info = await api.getStudentTransport(studentId);
      setCurrent(info);
    } catch {
      setError("Could not assign transport. Please try again.");
    }
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
            <Select value={stopId} disabled={!routeId} onValueChange={handleAssign}>
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!canAssign && !current && <p className="text-sm text-muted-foreground">Not assigned</p>}
      </CardContent>
    </Card>
  );
}

function ElectivesCard({ studentId, classId }: { studentId: string; classId: string }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canEdit = hasPermission("students.edit");
  const [groups, setGroups] = useState<ElectiveGroup[]>([]);
  const [choices, setChoices] = useState<StudentElectiveChoice[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    api.listElectiveGroups(classId).then(setGroups);
    api.listAcademicSessions().then((list) => {
      setSessions(list);
      setSessionId((current) => current || list.find((s) => s.is_current)?.id || list[0]?.id || "");
    });
  }, [classId]);

  useEffect(() => {
    if (sessionId) api.listStudentElectives(studentId, sessionId).then(setChoices);
  }, [studentId, sessionId]);

  const handleElect = async (groupId: string, subjectId: string) => {
    if (!sessionId) return;
    await api.electSubject(studentId, groupId, subjectId, sessionId);
    setChoices(await api.listStudentElectives(studentId, sessionId));
  };

  if (groups.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Electives</CardTitle>
        {sessions.length > 1 && (
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {groups.map((group) => {
          const choice = choices.find((c) => c.elective_group_id === group.id);
          return (
            <div key={group.id} className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{group.name}</span>
              {canEdit ? (
                <Select value={choice?.subject_id ?? undefined} onValueChange={(v) => handleElect(group.id, v)}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Not chosen" />
                  </SelectTrigger>
                  <SelectContent>
                    {group.members.map((m) => (
                      <SelectItem key={m.subject_id} value={m.subject_id}>
                        {m.subject_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm font-medium">{choice?.subject_name ?? "Not chosen"}</span>
              )}
            </div>
          );
        })}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <Label>Full name</Label>
              <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Relation</Label>
              <MasterDataSelect
                type="guardian_relation"
                value={form.relation ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, relation: v }))}
              />
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
            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 flex flex-col gap-1.5">
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

