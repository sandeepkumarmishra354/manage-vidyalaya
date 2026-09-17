import { useCallback, useEffect, useRef, useState } from "react";
import { PaperclipIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type Expense } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { formatPaise } from "@/lib/money";
import { MasterDataSelect } from "@/components/master-data-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function AddExpenseDialog({ branchId, onAdded }: { branchId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setDescription("");
    setAmount("");
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setCategoryId("");
    setPaymentMode("");
    setVendorName("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const expense = await api.createExpense({
        branch_id: branchId,
        category_id: categoryId || null,
        description,
        amount: Math.round(Number(amount) * 100),
        expense_date: expenseDate,
        payment_mode: paymentMode || null,
        vendor_name: vendorName || null,
      });

      const file = fileRef.current?.files?.[0];
      if (file) {
        const upload = await api.getExpenseReceiptUploadUrl(expense.id, file.name, file.type || "application/octet-stream");
        await fetch(upload.url, {
          method: upload.method,
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        await api.attachExpenseReceipt(expense.id, upload.storage_key);
      }

      reset();
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          Add expense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exp-description">Description</Label>
            <Input id="exp-description" value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-amount">Amount (₹)</Label>
              <Input id="exp-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-date">Date</Label>
              <Input id="exp-date" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <MasterDataSelect type="expense_category" value={categoryId} onChange={setCategoryId} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-payment-mode">Payment mode</Label>
              <Input id="exp-payment-mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} placeholder="e.g. Cash, UPI, Bank" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-vendor">Vendor</Label>
              <Input id="exp-vendor" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exp-receipt">Receipt (optional)</Label>
            <Input id="exp-receipt" type="file" ref={fileRef} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Add expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReportsSection({ branchId, from, to, refreshKey }: { branchId: string; from: string; to: string; refreshKey: number }) {
  const [summary, setSummary] = useState<{ total: number; by_category: { category_id: string | null; amount: number }[]; by_month: { month: string; amount: number }[] } | null>(null);

  useEffect(() => {
    api.getExpenseSummary(branchId, { from: from || undefined, to: to || undefined }).then(setSummary);
  }, [branchId, from, to, refreshKey]);

  if (!summary) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Total expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{formatPaise(summary.total)}</p>
          <p className="text-sm text-muted-foreground">for the selected date range</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By month</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {summary.by_month.length === 0 && <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>}
          {summary.by_month.map((m) => (
            <div key={m.month} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{m.month}</span>
              <span className="font-medium">{formatPaise(m.amount)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By category</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {summary.by_category.length === 0 && <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>}
          {summary.by_category.map((c) => (
            <div key={c.category_id ?? "uncategorized"} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{c.category_id ?? "Uncategorized"}</span>
              <span className="font-medium">{formatPaise(c.amount)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function ExpensesPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("expenses.manage");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    if (!selectedBranchId) return;
    api.listExpenses(selectedBranchId, { from: from || undefined, to: to || undefined }).then(setExpenses);
    setRefreshKey((k) => k + 1);
  }, [selectedBranchId, from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDownloadReceipt = async (expense: Expense) => {
    setBusyId(expense.id);
    try {
      const { url } = await api.getExpenseReceiptDownloadUrl(expense.id);
      window.open(url, "_blank", "noreferrer");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (expense: Expense) => {
    setBusyId(expense.id);
    try {
      await api.deleteExpense(expense.id);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Expense Manager</h1>
          <p className="text-muted-foreground">Track and report on branch expenses.</p>
        </div>
        {canManage && selectedBranchId && <AddExpenseDialog branchId={selectedBranchId} onAdded={refresh} />}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-from" className="text-xs text-muted-foreground">From</Label>
          <Input id="exp-from" type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exp-to" className="text-xs text-muted-foreground">To</Label>
          <Input id="exp-to" type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {selectedBranchId && <ReportsSection branchId={selectedBranchId} from={from} to={to} refreshKey={refreshKey} />}

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Payment mode</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell>{formatDate(expense.expense_date)}</TableCell>
                  <TableCell className="font-medium">{expense.description}</TableCell>
                  <TableCell>{expense.vendor_name ?? "—"}</TableCell>
                  <TableCell>{expense.payment_mode ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatPaise(expense.amount)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {expense.has_receipt && (
                        <Button variant="ghost" size="sm" disabled={busyId === expense.id} onClick={() => handleDownloadReceipt(expense)}>
                          <PaperclipIcon className="size-3.5" />
                        </Button>
                      )}
                      {canManage && (
                        <Button variant="ghost" size="sm" disabled={busyId === expense.id} onClick={() => handleDelete(expense)}>
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No expenses recorded for this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
