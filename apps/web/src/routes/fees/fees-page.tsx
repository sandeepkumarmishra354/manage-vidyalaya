import { useCallback, useEffect, useMemo, useState } from "react";
import { PencilIcon, PlusIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  FEE_TYPE_LABELS,
  type DiscountAssignee,
  type FeeCategory,
  type FeeDiscount,
  type FeeFrequency,
  type FeeInvoiceListItem,
  type FeeStructure,
  type FeeType,
  type InvoiceStatus,
  type PaymentListItem,
  type SchoolClass,
  type StudentFeeAssignment,
  type StudentListItem,
} from "@/lib/api";
import { formatDate } from "@/lib/date";
import { formatPaise } from "@/lib/money";
import { PersonLink } from "@/components/person-link";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeeCategorySelect } from "./fee-category-select";
import { RecordPaymentBatchDialog } from "./record-payment-batch-dialog";
import { RecordPaymentDialog } from "./record-payment-dialog";

const PAYABLE_STATUSES: InvoiceStatus[] = ["pending", "partial", "overdue"];
const ALL_CLASSES = "__all__";

function feeCategoryLabel(categories: FeeCategory[], key: string): string {
  return categories.find((c) => c.key === key)?.name ?? FEE_TYPE_LABELS[key] ?? key;
}

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function EditFeeStructureDialog({
  structure,
  classes,
  onUpdated,
}: {
  structure: FeeStructure;
  classes: SchoolClass[];
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(structure.name);
  const [amount, setAmount] = useState(String(structure.amount / 100));
  const [frequency, setFrequency] = useState<FeeFrequency>(structure.frequency);
  const [feeType, setFeeType] = useState<FeeType>(structure.fee_type);
  const [sessionScoped, setSessionScoped] = useState(structure.academic_session_id !== null);
  const [classId, setClassId] = useState<string>(structure.class_id ?? ALL_CLASSES);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.updateFeeStructure({
        id: structure.id,
        name,
        amount: Math.round(Number(amount) * 100),
        frequency,
        fee_type: feeType,
        academic_session_id: sessionScoped ? structure.academic_session_id : null,
        class_id: sessionScoped && classId !== ALL_CLASSES ? classId : null,
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
        <DialogHeader><DialogTitle>Edit fee structure</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Amount (Rs.)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as FeeFrequency)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">One-time</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Fee type</Label>
            <FeeCategorySelect value={feeType} onChange={setFeeType} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Applies to</Label>
            <Select value={sessionScoped ? "session" : "all"} onValueChange={(v) => setSessionScoped(v === "session")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="session">This session only</SelectItem>
                <SelectItem value="all">All sessions (until changed)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {sessionScoped && (
            <div className="flex flex-col gap-1.5">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLASSES}>All classes</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Generate invoices for one structure, either through a chosen month (for
// monthly/quarterly structures) or a single click for one_time/annual.
function GenerateInvoicesDialog({
  structure,
  onGenerated,
}: {
  structure: FeeStructure;
  onGenerated: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [upToPeriod, setUpToPeriod] = useState(currentMonthValue());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPeriodic = structure.frequency === "monthly" || structure.frequency === "quarterly";

  const run = async (period?: string) => {
    setIsSubmitting(true);
    try {
      const count = await api.generateInvoices(structure.id, period);
      onGenerated(`Created ${count} new invoice(s).`);
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isPeriodic) {
    return (
      <Button variant="outline" size="sm" disabled={isSubmitting} onClick={() => run()}>
        {isSubmitting ? "Generating..." : "Generate invoices"}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Generate invoices...</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Generate invoices -- {structure.name}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Creates one invoice per period from the start of the session through the month below -- already-generated
            periods are skipped, so this is safe to run again later.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label>Through month</Label>
            <Input type="month" value={upToPeriod} onChange={(e) => setUpToPeriod(e.target.value)} className="w-44" />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" disabled={isSubmitting} onClick={() => run()}>
            Through session end
          </Button>
          <Button disabled={isSubmitting} onClick={() => run(upToPeriod)}>
            {isSubmitting ? "Generating..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Per-student include/exclude overrides against one fee structure -- opt a
// class-wide fee out for one family, or assign it to a student outside the
// structure's normal class match.
function StructureOverridesDialog({ structure }: { structure: FeeStructure }) {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [open, setOpen] = useState(false);
  const [assignments, setAssignments] = useState<StudentFeeAssignment[]>([]);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [studentId, setStudentId] = useState("");
  const [mode, setMode] = useState<"include" | "exclude">("exclude");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.listFeeStructureAssignments(structure.id).then(setAssignments);
  }, [structure.id]);

  useEffect(() => {
    if (open) {
      refresh();
      if (selectedBranchId) api.listStudents(selectedBranchId).then((list) => setStudents(list.filter((s) => s.status === "enrolled")));
    }
  }, [open, refresh, selectedBranchId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await api.setStudentFeeAssignment({ student_id: studentId, fee_structure_id: structure.id, mode, reason: reason || null });
      setStudentId("");
      setReason("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    await api.removeStudentFeeAssignment(id);
    refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UsersIcon />
          Overrides
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Student overrides -- {structure.name}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {assignments.length === 0 && <p className="text-sm text-muted-foreground">No overrides yet.</p>}
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <div>
                  <span className="font-medium">{a.student_name}</span>{" "}
                  <Badge variant={a.mode === "include" ? "success" : "destructive"}>{a.mode}</Badge>
                  {a.reason && <span className="ml-2 text-muted-foreground">{a.reason}</span>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRemove(a.id)}>
                  <XIcon className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <form className="flex flex-wrap items-end gap-3 border-t pt-4" onSubmit={handleAdd}>
            <div className="flex flex-col gap-1.5">
              <Label>Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name ?? ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "include" | "exclude")}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="exclude">Exclude</SelectItem>
                  <SelectItem value="include">Include</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" className="w-40" />
            </div>
            <Button type="submit" size="sm" disabled={isSubmitting || !studentId}>
              Add
            </Button>
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const statusVariant: Record<InvoiceStatus, "info" | "warning" | "success" | "destructive" | "secondary"> = {
  pending: "info",
  partial: "warning",
  paid: "success",
  overdue: "destructive",
  waived: "secondary",
  voided: "destructive",
};

const feeTypeVariant: Record<FeeType, "default" | "secondary" | "outline" | "info" | "success" | "warning"> = {
  tuition: "default",
  transport: "info",
  library: "secondary",
  exam: "warning",
  hostel: "success",
  admission: "outline",
  other: "outline",
};

function StructuresTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<FeeFrequency>("monthly");
  const [feeType, setFeeType] = useState<FeeType>("tuition");
  const [sessionScoped, setSessionScoped] = useState(true);
  const [classId, setClassId] = useState<string>(ALL_CLASSES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (selectedBranchId) api.listFeeStructures(selectedBranchId).then(setStructures);
  }, [selectedBranchId]);

  useEffect(() => {
    if (selectedBranchId) api.listClasses(selectedBranchId).then(setClasses);
    api.listFeeCategories().then(setCategories);
    refresh();
  }, [selectedBranchId, refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) return;
    let academicSessionId: string | null = null;
    if (sessionScoped) {
      academicSessionId = await api.currentAcademicSessionId();
      if (!academicSessionId) return;
    }
    setIsSubmitting(true);
    try {
      await api.createFeeStructure({
        branch_id: selectedBranchId,
        academic_session_id: academicSessionId,
        class_id: sessionScoped && classId !== ALL_CLASSES ? classId : null,
        name,
        amount: Math.round(Number(amount) * 100),
        frequency,
        fee_type: feeType,
      });
      setName("");
      setAmount("");
      refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateBulk = async () => {
    if (!selectedBranchId) return;
    const academicSessionId = await api.currentAcademicSessionId();
    if (!academicSessionId) return;
    setIsGeneratingBulk(true);
    setMessage(null);
    try {
      const result = await api.generateInvoicesBulk(selectedBranchId, academicSessionId);
      setMessage(`Created ${result.created} new invoice(s) across ${result.by_structure.length} fee type(s).`);
    } finally {
      setIsGeneratingBulk(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {hasPermission("fees.manage_structures") && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New fee structure</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleCreate}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fee-name">Name</Label>
              <Input id="fee-name" value={name} onChange={(e) => setName(e.target.value)} required className="w-48" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fee-amount">Amount (Rs.)</Label>
              <Input
                id="fee-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-32"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as FeeFrequency)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Fee type</Label>
              <div className="w-40">
                <FeeCategorySelect value={feeType} onChange={setFeeType} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Applies to</Label>
              <Select value={sessionScoped ? "session" : "all"} onValueChange={(v) => setSessionScoped(v === "session")}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="session">A specific session</SelectItem>
                  <SelectItem value="all">All sessions (until changed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {sessionScoped && (
              <div className="flex flex-col gap-1.5">
                <Label>Class</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CLASSES}>All classes</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" disabled={isSubmitting}>
              <PlusIcon />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      <div className="flex items-center justify-between">
        {hasPermission("fees.generate_invoices") && structures.length > 0 && (
          <Button variant="outline" size="sm" disabled={isGeneratingBulk} onClick={handleGenerateBulk}>
            {isGeneratingBulk ? "Generating..." : "Generate invoices for all fee types (through current month)"}
          </Button>
        )}
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {structures.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>
                  <Badge variant={feeTypeVariant[s.fee_type] ?? "outline"}>
                    {feeCategoryLabel(categories, s.fee_type)}
                  </Badge>
                </TableCell>
                <TableCell>{formatPaise(s.amount)}</TableCell>
                <TableCell className="capitalize">{s.frequency.replace("_", " ")}</TableCell>
                <TableCell>
                  {s.academic_session_id === null
                    ? "All sessions"
                    : (classes.find((c) => c.id === s.class_id)?.name ?? "All classes")}
                </TableCell>
                <TableCell className="flex flex-wrap justify-end gap-2 text-right">
                  {hasPermission("fees.manage_structures") && (
                    <>
                      <EditFeeStructureDialog structure={s} classes={classes} onUpdated={refresh} />
                      <StructureOverridesDialog structure={s} />
                    </>
                  )}
                  {hasPermission("fees.generate_invoices") && (
                    <GenerateInvoicesDialog structure={s} onGenerated={setMessage} />
                  )}
                </TableCell>
              </TableRow>
            ))}
            {structures.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No fee structures yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EditInvoiceDialog({ invoice, onUpdated }: { invoice: FeeInvoiceListItem; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [amountDue, setAmountDue] = useState(String(invoice.amount_due / 100));
  const [dueDate, setDueDate] = useState(invoice.due_date?.slice(0, 10) ?? "");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    setIsSubmitting(true);
    try {
      await api.editInvoice({
        invoice_id: invoice.id,
        amount_due: Math.round(Number(amountDue) * 100),
        due_date: dueDate || null,
        reason,
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
        <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
          <PencilIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>Edit invoice -- {invoice.fee_structure_name}</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Amount due (Rs.)</Label>
            <Input type="number" min="0" step="0.01" value={amountDue} onChange={(e) => setAmountDue(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Reason for editing</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. correcting a data-entry error" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvoicesTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canRecordPayment = hasPermission("fees.record_payment");
  const canEditInvoice = hasPermission("fees.void_invoice");
  const [invoices, setInvoices] = useState<FeeInvoiceListItem[]>([]);
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [feeTypeFilter, setFeeTypeFilter] = useState<string>("__all__");
  const [activeInvoice, setActiveInvoice] = useState<FeeInvoiceListItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDialog, setShowBatchDialog] = useState(false);

  const refresh = useCallback(() => {
    if (!selectedBranchId) return;
    api
      .listInvoices(
        selectedBranchId,
        statusFilter === "__all__" ? null : (statusFilter as InvoiceStatus),
        feeTypeFilter === "__all__" ? null : (feeTypeFilter as FeeType),
      )
      .then(setInvoices);
  }, [selectedBranchId, statusFilter, feeTypeFilter]);

  useEffect(() => {
    api.listFeeCategories().then(setCategories);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedStudentId = invoices.find((inv) => selectedIds.has(inv.id))?.student_id ?? null;
  const selectedInvoices = invoices.filter((inv) => selectedIds.has(inv.id));

  const toggleSelect = (inv: FeeInvoiceListItem, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(inv.id);
      else next.delete(inv.id);
      return next;
    });
  };

  const summary = useMemo(() => {
    const outstanding = invoices
      .filter((inv) => inv.status !== "voided" && inv.status !== "paid")
      .reduce((sum, inv) => sum + (inv.amount_due - inv.amount_paid), 0);
    const studentsWithDues = new Set(
      invoices
        .filter((inv) => inv.status !== "voided" && inv.status !== "paid" && inv.amount_due - inv.amount_paid > 0)
        .map((inv) => inv.student_id),
    ).size;
    return { outstanding, studentsWithDues };
  }, [invoices]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        <Select value={feeTypeFilter} onValueChange={setFeeTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All fee types</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.key}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
        {canRecordPayment && selectedInvoices.length > 0 && (
          <Button size="sm" onClick={() => setShowBatchDialog(true)}>
            Pay {selectedInvoices.length} selected
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <span>
          <span className="text-muted-foreground">Outstanding: </span>
          <span className="font-semibold">{formatPaise(summary.outstanding)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Students with dues: </span>
          <span className="font-semibold">{summary.studentsWithDues}</span>
        </span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {canRecordPayment && <TableHead />}
              <TableHead>Student</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Status</TableHead>
              {canEditInvoice && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => {
              const isPayable = PAYABLE_STATUSES.includes(inv.status);
              const isSelectable = isPayable && (!selectedStudentId || selectedStudentId === inv.student_id);
              return (
                <TableRow
                  key={inv.id}
                  className={canRecordPayment ? "cursor-pointer" : undefined}
                  onClick={canRecordPayment ? () => setActiveInvoice(inv) : undefined}
                >
                  {canRecordPayment && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        disabled={!isSelectable}
                        checked={selectedIds.has(inv.id)}
                        onChange={(e) => toggleSelect(inv, e.target.checked)}
                        title={
                          !isPayable
                            ? "Only pending/partial/overdue invoices can be paid"
                            : !isSelectable
                              ? "Combined payment is scoped to one student at a time"
                              : undefined
                        }
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    <PersonLink type="student" id={inv.student_id} name={inv.student_name} />
                  </TableCell>
                  <TableCell>{inv.fee_structure_name}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.period_label || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={feeTypeVariant[inv.fee_type] ?? "outline"}>
                      {feeCategoryLabel(categories, inv.fee_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatPaise(inv.amount_due)}
                    {inv.discount_amount > 0 && (
                      <span className="ml-1.5 text-xs text-success">-{formatPaise(inv.discount_amount)}</span>
                    )}
                  </TableCell>
                  <TableCell>{formatPaise(inv.amount_paid)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[inv.status]}>{inv.status}</Badge>
                  </TableCell>
                  {canEditInvoice && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <EditInvoiceDialog invoice={inv} onUpdated={refresh} />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={canRecordPayment ? 8 : 7} className="py-8 text-center text-muted-foreground">
                  No invoices yet -- create a fee structure and generate invoices.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <RecordPaymentDialog
        invoice={activeInvoice}
        onOpenChange={(open) => !open && setActiveInvoice(null)}
        onRecorded={refresh}
      />

      <RecordPaymentBatchDialog
        invoices={showBatchDialog ? selectedInvoices : []}
        onOpenChange={(open) => {
          if (!open) {
            setShowBatchDialog(false);
            setSelectedIds(new Set());
          }
        }}
        onRecorded={refresh}
      />
    </div>
  );
}

function EditPaymentDialog({ payment, onUpdated }: { payment: PaymentListItem; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount / 100));
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    setIsSubmitting(true);
    try {
      await api.editPayment({
        payment_id: payment.id,
        amount: Math.round(Number(amount) * 100),
        payment_method: payment.payment_method,
        payment_date: payment.payment_date.slice(0, 10),
        reason,
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
        <DialogHeader><DialogTitle>Correct payment</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <p className="text-sm text-muted-foreground">
            Reverses this payment and records a new one for the corrected amount, keeping the same receipt number.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label>Amount (Rs.)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. wrong amount entered" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save correction"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentsTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("fees.record_payment");
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const refresh = useCallback(() => {
    if (!selectedBranchId) return;
    api.listPayments(selectedBranchId, { from: from || undefined, to: to || undefined }).then(setPayments);
  }, [selectedBranchId, from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return payments;
    return payments.filter(
      (p) => p.student_name.toLowerCase().includes(term) || (p.receipt_number ?? "").toLowerCase().includes(term),
    );
  }, [payments, search]);

  const handleReverse = async (payment: PaymentListItem) => {
    const reason = window.prompt("Reason for reversing this payment:");
    if (!reason) return;
    await api.reversePayment({ payment_id: payment.id, reason });
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by student or receipt #..."
            className="w-64 pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Receipt #</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id} className={p.amount < 0 ? "text-muted-foreground italic" : undefined}>
                <TableCell className="font-medium">
                  <PersonLink type="student" id={p.student_id} name={p.student_name} />
                </TableCell>
                <TableCell>{p.fee_structure_name}</TableCell>
                <TableCell>{formatPaise(p.amount)}</TableCell>
                <TableCell className="capitalize">{p.payment_method.replace("_", " ")}</TableCell>
                <TableCell>{formatDate(p.payment_date)}</TableCell>
                <TableCell>{p.receipt_number ?? "-"}</TableCell>
                <TableCell className="flex justify-end gap-1 text-right">
                  {p.receipt_number && <ReprintReceiptDialog receiptNumber={p.receipt_number} />}
                  {canManage && p.amount > 0 && (
                    <>
                      <EditPaymentDialog payment={p} onUpdated={refresh} />
                      <Button variant="ghost" size="sm" onClick={() => handleReverse(p)}>
                        <XIcon className="size-3.5" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No payments match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ManageDiscountStudentsDialog({ discount }: { discount: FeeDiscount }) {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [open, setOpen] = useState(false);
  const [assignees, setAssignees] = useState<DiscountAssignee[]>([]);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [suggested, setSuggested] = useState<{ id: string; first_name: string; last_name?: string | null }[]>([]);
  const [studentId, setStudentId] = useState("");
  const [reason, setReason] = useState("");
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(() => {
    api.listFeeDiscountAssignees(discount.id).then(setAssignees);
  }, [discount.id]);

  useEffect(() => {
    if (open) {
      refresh();
      if (selectedBranchId) api.listStudents(selectedBranchId).then((list) => setStudents(list.filter((s) => s.status === "enrolled")));
    }
  }, [open, refresh, selectedBranchId]);

  const handleAssign = async (id: string) => {
    if (!id) return;
    setIsSubmitting(true);
    try {
      await api.assignFeeDiscount(discount.id, [id], applyToExisting, reason || null);
      setStudentId("");
      setReason("");
      setSuggested([]);
      refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    await api.removeFeeDiscountAssignment(assignmentId);
    refresh();
  };

  const handleSuggestSiblings = async (fromStudentId: string) => {
    const siblings = await api.suggestSiblingsForDiscount(fromStudentId);
    setSuggested(siblings.filter((s) => !assignees.some((a) => a.student_id === s.id)));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UsersIcon />
          Manage students
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Students -- {discount.name}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {assignees.length === 0 && <p className="text-sm text-muted-foreground">No students assigned yet.</p>}
            {assignees.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.student_name}</span>
                  {a.class_name && <span className="text-muted-foreground">{a.class_name}</span>}
                  {a.reason && <span className="text-muted-foreground">-- {a.reason}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleSuggestSiblings(a.student_id)}>
                    Suggest siblings
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(a.id)}>
                    <XIcon className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {suggested.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-md border border-dashed p-2">
              {suggested.map((s) => (
                <Button key={s.id} variant="outline" size="sm" onClick={() => handleAssign(s.id)}>
                  <PlusIcon className="size-3" />
                  {s.first_name} {s.last_name ?? ""}
                </Button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Student</Label>
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Select student" /></SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name ?? ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" className="w-40" />
              </div>
              <Button size="sm" disabled={isSubmitting || !studentId} onClick={() => handleAssign(studentId)}>
                Assign
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={applyToExisting} onChange={(e) => setApplyToExisting(e.target.checked)} />
              Also apply to this student's existing unpaid invoices this session
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ANY_CATEGORY = "__any__";

function NewFeeDiscountForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "flat">("percentage");
  const [value, setValue] = useState("");
  const [feeCategoryId, setFeeCategoryId] = useState(ANY_CATEGORY);
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    api.listFeeCategories().then(setCategories);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.createFeeDiscount({
        name,
        discount_type: discountType,
        value: discountType === "flat" ? Math.round(Number(value) * 100) : Number(value),
        fee_category_id: feeCategoryId === ANY_CATEGORY ? null : feeCategoryId,
      });
      setName("");
      setValue("");
      onCreated();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New discount</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-wrap items-end gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required className="w-48" placeholder="e.g. Sibling discount" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select value={discountType} onValueChange={(v) => setDiscountType(v as "percentage" | "flat")}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="flat">Flat amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{discountType === "percentage" ? "Percent" : "Amount (Rs.)"}</Label>
            <Input type="number" min="0" step={discountType === "percentage" ? "1" : "0.01"} value={value} onChange={(e) => setValue(e.target.value)} required className="w-28" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Fee category</Label>
            <Select value={feeCategoryId} onValueChange={setFeeCategoryId}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_CATEGORY}>Any fee</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            <PlusIcon />
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DiscountsTab() {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("fees.manage_discounts");
  const [discounts, setDiscounts] = useState<FeeDiscount[]>([]);

  const refresh = useCallback(() => {
    api.listFeeDiscounts().then(setDiscounts);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleToggleActive = async (d: FeeDiscount) => {
    await api.updateFeeDiscount({ id: d.id, name: d.name, discount_type: d.discount_type, value: d.value, fee_category_id: d.fee_category_id, is_active: !d.is_active });
    refresh();
  };

  const handleDelete = async (d: FeeDiscount) => {
    if (!window.confirm(`Delete discount "${d.name}"?`)) return;
    await api.deleteFeeDiscount(d.id);
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      {canManage && <NewFeeDiscountForm onCreated={refresh} />}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {discounts.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="capitalize">{d.discount_type}</TableCell>
                <TableCell>{d.discount_type === "percentage" ? `${d.value}%` : formatPaise(d.value)}</TableCell>
                <TableCell>
                  <Badge variant={d.is_active ? "success" : "secondary"}>{d.is_active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell className="flex flex-wrap justify-end gap-2 text-right">
                  <ManageDiscountStudentsDialog discount={d} />
                  {canManage && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => handleToggleActive(d)}>
                        {d.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(d)}>
                        <XIcon className="size-3.5" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {discounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No discounts yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function FeesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Fees &amp; Billing</h1>
        <p className="text-muted-foreground">Fee structures, invoices, payments, and discounts.</p>
      </div>
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="structures">Fee Structures</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="discounts">Discounts</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="structures">
          <StructuresTab />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab />
        </TabsContent>
        <TabsContent value="discounts">
          <DiscountsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
