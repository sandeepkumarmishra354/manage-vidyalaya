import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  FEE_TYPE_LABELS,
  type FeeCategory,
  type FeeFrequency,
  type FeeInvoiceListItem,
  type FeeStructure,
  type FeeType,
  type InvoiceStatus,
  type SchoolClass,
} from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { PersonLink } from "@/components/person-link";
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

function feeCategoryLabel(categories: FeeCategory[], key: string): string {
  return categories.find((c) => c.key === key)?.name ?? FEE_TYPE_LABELS[key] ?? key;
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
  const [classId, setClassId] = useState<string>(structure.class_id ?? "__all__");
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
        class_id: classId === "__all__" ? null : classId,
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
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
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
  const [classId, setClassId] = useState<string>("__all__");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
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
    const academicSessionId = await api.currentAcademicSessionId();
    if (!academicSessionId) return;
    setIsSubmitting(true);
    try {
      await api.createFeeStructure({
        branch_id: selectedBranchId,
        academic_session_id: academicSessionId,
        class_id: classId === "__all__" ? null : classId,
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

  const handleGenerate = async (structureId: string) => {
    setGeneratingId(structureId);
    setMessage(null);
    try {
      const count = await api.generateInvoices(structureId);
      setMessage(`Created ${count} new invoice(s).`);
    } finally {
      setGeneratingId(null);
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
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All classes</SelectItem>
                  {classes.map((c) => (
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
      )}

      <div className="flex items-center justify-between">
        {hasPermission("fees.generate_invoices") && structures.length > 0 && (
          <Button variant="outline" size="sm" disabled={isGeneratingBulk} onClick={handleGenerateBulk}>
            {isGeneratingBulk ? "Generating..." : "Generate invoices for all fee types"}
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
                  {classes.find((c) => c.id === s.class_id)?.name ?? "All classes"}
                </TableCell>
                <TableCell className="flex justify-end gap-2 text-right">
                  {hasPermission("fees.manage_structures") && (
                    <EditFeeStructureDialog structure={s} classes={classes} onUpdated={refresh} />
                  )}
                  {hasPermission("fees.generate_invoices") && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={generatingId === s.id}
                      onClick={() => handleGenerate(s.id)}
                    >
                      {generatingId === s.id ? "Generating..." : "Generate invoices"}
                    </Button>
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

function InvoicesTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canRecordPayment = hasPermission("fees.record_payment");
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {canRecordPayment && <TableHead />}
              <TableHead>Student</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Status</TableHead>
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
                  <TableCell>
                    <Badge variant={feeTypeVariant[inv.fee_type] ?? "outline"}>
                      {feeCategoryLabel(categories, inv.fee_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatPaise(inv.amount_due)}</TableCell>
                  <TableCell>{formatPaise(inv.amount_paid)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[inv.status]}>{inv.status}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={canRecordPayment ? 7 : 6} className="py-8 text-center text-muted-foreground">
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

export function FeesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Fees &amp; Billing</h1>
        <p className="text-muted-foreground">Fee structures, invoices, and payments.</p>
      </div>
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="structures">Fee Structures</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="structures">
          <StructuresTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
