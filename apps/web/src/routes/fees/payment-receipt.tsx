import { PrinterIcon } from "lucide-react";

import { FEE_TYPE_LABELS, type Branch, type FeeInvoiceListItem, type FeePayment } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { PrintLetterhead } from "@/components/print-letterhead";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  cheque: "Cheque",
  upi: "UPI",
  card: "Card",
  online: "Online",
  bank_transfer: "Bank Transfer",
};

/** Fee payment receipt, printed via the same data-print-area mechanism as every other document. */
export function PaymentReceipt({
  payment,
  invoice,
  branch,
}: {
  payment: FeePayment;
  invoice: FeeInvoiceListItem;
  branch?: Branch;
}) {
  // `invoice` is a pre-payment snapshot (the parent doesn't re-fetch mid-dialog),
  // so the running total/balance are derived from it plus this payment.
  const totalPaid = invoice.amount_paid + payment.amount;
  const balance = invoice.amount_due - totalPaid;

  return (
    <>
      <Card data-no-print>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Payment recorded</CardTitle>
          <Button variant="outline" onClick={() => window.print()}>
            <PrinterIcon />
            Print receipt
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {formatPaise(payment.amount)} received from {invoice.student_name} for {invoice.fee_structure_name}.
        </CardContent>
      </Card>

      <div data-print-area className="hidden p-8 print:block">
        <PrintLetterhead
          branch={branch}
          documentTitle="Payment Receipt"
          right={
            <>
              {payment.receipt_number && <p>Receipt #{payment.receipt_number}</p>}
              <p>Date: {payment.payment_date.slice(0, 10)}</p>
            </>
          }
        />
        <div className="mb-6 grid grid-cols-2 gap-y-2 text-sm">
          <p className="text-slate-600">Student</p>
          <p className="font-medium">{invoice.student_name}</p>
          <p className="text-slate-600">Fee</p>
          <p className="font-medium">
            {invoice.fee_structure_name} ({FEE_TYPE_LABELS[invoice.fee_type]})
          </p>
          <p className="text-slate-600">Payment method</p>
          <p className="font-medium">{PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}</p>
        </div>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-b">
              <td className="py-1.5 text-slate-600">Amount due</td>
              <td className="py-1.5 text-right font-medium">{formatPaise(invoice.amount_due)}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1.5 text-slate-600">This payment</td>
              <td className="py-1.5 text-right font-medium">{formatPaise(payment.amount)}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1.5 text-slate-600">Total paid to date</td>
              <td className="py-1.5 text-right font-medium">{formatPaise(totalPaid)}</td>
            </tr>
            <tr>
              <td className="py-1.5 font-semibold">Balance due</td>
              <td className="py-1.5 text-right font-semibold">{formatPaise(balance)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-16 flex justify-end">
          <div className="border-t pt-1 text-center text-xs text-slate-600">Authorized signatory</div>
        </div>
      </div>
    </>
  );
}
