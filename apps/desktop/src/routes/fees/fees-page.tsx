import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  type FeeFrequency,
  type FeeInvoiceListItem,
  type FeeStructure,
  type InvoiceStatus,
  type SchoolClass,
} from "@/lib/api";
import { formatPaise } from "@/lib/money";
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
import { RecordPaymentDialog } from "./record-payment-dialog";

function EditFeeStructureDialog({ structure, onUpdated }: { structure: FeeStructure; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(structure.name);
  const [amount, setAmount] = useState(String(structure.amount / 100));
  const [frequency, setFrequency] = useState<FeeFrequency>(structure.frequency);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.updateFeeStructure({ id: structure.id, name, amount: Math.round(Number(amount) * 100), frequency });
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
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const statusVariant: Record<InvoiceStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  partial: "secondary",
  paid: "default",
  overdue: "destructive",
  waived: "outline",
  voided: "destructive",
};

function StructuresTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<FeeFrequency>("monthly");
  const [classId, setClassId] = useState<string>("__all__");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (selectedBranchId) api.listFeeStructures(selectedBranchId).then(setStructures);
  }, [selectedBranchId]);

  useEffect(() => {
    if (selectedBranchId) api.listClasses(selectedBranchId).then(setClasses);
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

  return (
    <div className="flex flex-col gap-4">
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

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
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
                <TableCell>{formatPaise(s.amount)}</TableCell>
                <TableCell className="capitalize">{s.frequency.replace("_", " ")}</TableCell>
                <TableCell>
                  {classes.find((c) => c.id === s.class_id)?.name ?? "All classes"}
                </TableCell>
                <TableCell className="flex justify-end gap-2 text-right">
                  <EditFeeStructureDialog structure={s} onUpdated={refresh} />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={generatingId === s.id}
                    onClick={() => handleGenerate(s.id)}
                  >
                    {generatingId === s.id ? "Generating..." : "Generate invoices"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {structures.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
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
  const [invoices, setInvoices] = useState<FeeInvoiceListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [activeInvoice, setActiveInvoice] = useState<FeeInvoiceListItem | null>(null);

  const refresh = useCallback(() => {
    if (!selectedBranchId) return;
    api
      .listInvoices(selectedBranchId, statusFilter === "__all__" ? null : (statusFilter as InvoiceStatus))
      .then(setInvoices);
  }, [selectedBranchId, statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
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
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id} className="cursor-pointer" onClick={() => setActiveInvoice(inv)}>
                <TableCell className="font-medium">{inv.student_name}</TableCell>
                <TableCell>{inv.fee_structure_name}</TableCell>
                <TableCell>{formatPaise(inv.amount_due)}</TableCell>
                <TableCell>{formatPaise(inv.amount_paid)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[inv.status]}>{inv.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
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
