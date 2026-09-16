import { PrinterIcon } from "lucide-react";

import { FEE_TYPE_LABELS, type Branch, type FeeInvoiceListItem, type FeePayment } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { PrintLetterhead } from "@/components/print-letterhead";
import { SignatureBlock } from "@/components/signature-block";
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

export interface PaymentReceiptEntry {
  payment: FeePayment;
  invoice: FeeInvoiceListItem;
}

/**
 * Fee payment receipt, printed via the same data-print-area mechanism as
 * every other document. Accepts one or more {payment, invoice} entries so a
 * single shared component covers both the single-payment flow (one entry)
 * and the combined/batch-payment flow (several entries, all for the same
 * student, sharing one receipt number and payment date).
 */
export function PaymentReceipt({ entries, branch }: { entries: PaymentReceiptEntry[]; branch?: Branch }) {
  const first = entries[0];
  const totalThisPayment = entries.reduce((sum, e) => sum + e.payment.amount, 0);

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
          {formatPaise(totalThisPayment)} received from {first.invoice.student_name}
          {entries.length === 1
            ? ` for ${first.invoice.fee_structure_name}.`
            : ` across ${entries.length} invoices.`}
        </CardContent>
      </Card>

      <div data-print-area className="hidden p-8 print:block">
        <PrintLetterhead
          branch={branch}
          documentTitle="Payment Receipt"
          right={
            <>
              {first.payment.receipt_number && <p>Receipt #{first.payment.receipt_number}</p>}
              <p>Date: {first.payment.payment_date.slice(0, 10)}</p>
            </>
          }
        />
        <div className="mb-6 grid grid-cols-2 gap-y-2 text-sm">
          <p className="text-slate-600">Student</p>
          <p className="font-medium">{first.invoice.student_name}</p>
          <p className="text-slate-600">Payment method</p>
          <p className="font-medium">
            {PAYMENT_METHOD_LABELS[first.payment.payment_method] ?? first.payment.payment_method}
          </p>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2">
              <th className="py-1.5 text-left">Fee</th>
              <th className="py-1.5 text-right">Amount due</th>
              <th className="py-1.5 text-right">This payment</th>
              <th className="py-1.5 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ payment, invoice }) => {
              const totalPaid = invoice.amount_paid + payment.amount;
              const balance = invoice.amount_due - totalPaid;
              return (
                <tr key={payment.id} className="border-b">
                  <td className="py-1.5">
                    {invoice.fee_structure_name} ({FEE_TYPE_LABELS[invoice.fee_type] ?? invoice.fee_type})
                  </td>
                  <td className="py-1.5 text-right">{formatPaise(invoice.amount_due)}</td>
                  <td className="py-1.5 text-right">{formatPaise(payment.amount)}</td>
                  <td className="py-1.5 text-right">{formatPaise(balance)}</td>
                </tr>
              );
            })}
          </tbody>
          {entries.length > 1 && (
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-1.5" colSpan={2}>
                  Total
                </td>
                <td className="py-1.5 text-right">{formatPaise(totalThisPayment)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
        <div className="mt-16 flex justify-end">
          <SignatureBlock branch={branch} />
        </div>
      </div>
    </>
  );
}
