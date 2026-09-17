import { useEffect, useState } from "react";
import { PrinterIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type FeeInvoiceListItem, type FeePayment } from "@/lib/api";
import { PaymentReceipt } from "@/routes/fees/payment-receipt";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * Reprint affordance for any already-recorded payment, keyed by its receipt
 * number. Used both on the Fees module's own Payments tab and on a
 * student's profile Payment history, so a receipt is reachable from
 * wherever an admin happens to be looking.
 */
export function ReprintReceiptDialog({ receiptNumber }: { receiptNumber: string }) {
  const branches = useAppStore((s) => s.branches);
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const branch = branches.find((b) => b.id === selectedBranchId);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<{ payment: FeePayment; invoice: FeeInvoiceListItem }[] | null>(null);

  useEffect(() => {
    if (open) {
      api.getPaymentReceipt(receiptNumber).then((data) =>
        setLines(data.map((d) => ({ payment: { ...d.payment, invoice_id: d.invoice.id }, invoice: d.invoice }))),
      );
    } else {
      setLines(null);
    }
  }, [open, receiptNumber]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <PrinterIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Receipt {receiptNumber}</DialogTitle></DialogHeader>
        {lines && lines.length > 0 ? (
          <PaymentReceipt entries={lines} branch={branch} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
