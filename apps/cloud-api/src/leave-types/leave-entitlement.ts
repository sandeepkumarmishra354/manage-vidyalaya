// Pure entitlement math, kept separate from LeaveTypesService/
// StaffLeaveService so it's trivial to unit test in isolation.

// Accrued entitlement for a leave type as of `asOfDate`, for a staff
// member who joined on `dateOfJoining`, pro-rated monthly from the later
// of (a) joining date and (b) 1 Jan of asOfDate's year -- i.e. entitlement
// resets every calendar year and a mid-year joiner only accrues from their
// joining month. The month of joining/asOfDate itself counts as a whole
// accrued month (no daily proration within a month), matching a simple
// "credited on the 1st" accrual rule.
export function accruedEntitlementDays(monthlyAccrualDays: number, dateOfJoining: Date, asOfDate: Date): number {
  const year = asOfDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const effectiveStart = dateOfJoining > yearStart ? dateOfJoining : yearStart;
  if (effectiveStart > asOfDate) return 0;

  const monthsElapsed =
    (asOfDate.getUTCFullYear() - effectiveStart.getUTCFullYear()) * 12 +
    (asOfDate.getUTCMonth() - effectiveStart.getUTCMonth()) +
    1;
  return Math.max(0, Math.min(12, monthsElapsed)) * monthlyAccrualDays;
}
