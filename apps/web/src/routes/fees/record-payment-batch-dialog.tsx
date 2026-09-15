import { useEffect, useState } from "react";

import { useAppStore } from "@/stores/app-store";
import { api, type FeeInvoiceListItem, type PaymentMethod } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPaise } from "@/lib/money";
import { PaymentReceipt, type PaymentReceiptEntry } from "./payment-receipt";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Records one payment per selected invoice, sharing one receipt number and
// date, in a single combined receipt -- explicit per-invoice amounts, no
// auto-allocation. Invoices are pre-filtered by the caller to one student.
export function RecordPaymentBatchDialog({
  invoices,
  onOpenChange,
  onRecorded,
}: {
  invoices: FeeInvoiceListItem[];
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}) {
  const branches = useAppStore((s) => s.branches);
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const branch = branches.find((b) => b.id === selectedBranchId);

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordedEntries, setRecordedEntries] = useState<PaymentReceiptEntry[] | null>(null);

  useEffect(() => {
    if (invoices.length > 0) {
      setAmounts(
        Object.fromEntries(invoices.map((inv) => [inv.id, String((inv.amount_due - inv.amount_paid) / 100)])),
      );
    }
  }, [invoices]);

  const reset = () => {
    setMethod("cash");
    setReceiptNumber("");
    setError(null);
    setRecordedEntries(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const total = invoices.reduce((sum, inv) => sum + (Math.round(Number(amounts[inv.id] || "0") * 100) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const entries = invoices
      .map((inv) => ({ invoice_id: inv.id, amount: Math.round(Number(amounts[inv.id] || "0") * 100) }))
      .filter((e) => e.amount > 0);
    if (entries.length === 0) {
      setError("Enter at least one valid amount.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const payments = await api.recordPaymentBatch({
        entries,
        payment_method: method,
        payment_date: todayIso(),
        receipt_number: receiptNumber || null,
      });
      const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]));
      setRecordedEntries(
        payments.map((payment) => ({ payment, invoice: invoiceById.get(payment.invoice_id)! })),
      );
      onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (recordedEntries) {
    return (
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment recorded</DialogTitle>
          </DialogHeader>
          <PaymentReceipt entries={recordedEntries} branch={branch} />
          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={invoices.length > 0} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record combined payment</DialogTitle>
          <DialogDescription>
            {invoices[0] && `${invoices[0].student_name} -- ${invoices.length} invoice(s)`}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Amount (Rs.)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.fee_structure_name}</TableCell>
                    <TableCell>{formatPaise(inv.amount_due - inv.amount_paid)}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-28"
                        value={amounts[inv.id] ?? ""}
                        onChange={(e) => setAmounts((a) => ({ ...a, [inv.id]: e.target.value }))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-right text-sm font-medium">Total: {formatPaise(total)}</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="batch-receipt">Receipt number (optional)</Label>
              <Input id="batch-receipt" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
