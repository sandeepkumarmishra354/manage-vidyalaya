/** Amounts are stored/transferred as minor units (paise) to avoid float rounding. */
export function formatPaise(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}
