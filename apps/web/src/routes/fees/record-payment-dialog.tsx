import { useState } from "react";

import { useAppStore } from "@/stores/app-store";
import { api, type FeeInvoiceListItem, type FeePayment, type PaymentMethod } from "@/lib/api";
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
import { formatPaise } from "@/lib/money";
import { PaymentReceipt } from "./payment-receipt";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RecordPaymentDialog({
  invoice,
  onOpenChange,
  onRecorded,
}: {
  invoice: FeeInvoiceListItem | null;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const branches = useAppStore((s) => s.branches);
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const branch = branches.find((b) => b.id === selectedBranchId);
  const balance = invoice ? invoice.amount_due - invoice.amount_paid : 0;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordedPayment, setRecordedPayment] = useState<FeePayment | null>(null);

  const handleVoid = async () => {
    if (!invoice) return;
    const reason = window.prompt("Reason for voiding this invoice:");
    if (!reason) return;
    setIsSubmitting(true);
    try {
      await api.voidInvoice({ invoice_id: invoice.id, reason });
      onOpenChange(false);
      onRecorded();
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setAmount("");
    setMethod("cash");
    setReceiptNumber("");
    setError(null);
    setRecordedPayment(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) return;
    const amountPaise = Math.round(Number(amount) * 100);
    if (!amountPaise || amountPaise <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const payment = await api.recordPayment({
        invoice_id: invoice.id,
        amount: amountPaise,
        payment_method: method,
        payment_date: todayIso(),
        receipt_number: receiptNumber || null,
      });
      setRecordedPayment(payment);
      onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  if (invoice && recordedPayment) {
    return (
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment recorded</DialogTitle>
          </DialogHeader>
          <PaymentReceipt payment={recordedPayment} invoice={invoice} branch={branch} />
          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={!!invoice} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {invoice && (
              <>
                {invoice.student_name} -- {invoice.fee_structure_name}. Balance due:{" "}
                {formatPaise(balance)}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Amount (Rs.)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
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
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receipt">Receipt number (optional)</Label>
            <Input id="receipt" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="sm:justify-between">
            {hasPermission("fees.void_invoice") && invoice?.status !== "voided" && (
              <Button type="button" variant="outline" onClick={handleVoid} disabled={isSubmitting}>
                Void invoice
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
