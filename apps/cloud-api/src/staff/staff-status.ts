// Every value Staff.status is ever set to across this codebase (creation
// defaults to "active"; issueExperienceLetter sets "relieved"; the rest are
// available via the generic setStaffStatus endpoint).
export const STAFF_STATUS_VALUES = ["active", "on_leave", "relieved", "terminated", "inactive"] as const;
export type StaffStatusValue = (typeof STAFF_STATUS_VALUES)[number];

// Statuses under which a staff member can still log in, apply for/be filed
// for leave, be scheduled for attendance, or have a new login created for
// them. Everything else ("relieved", "terminated", "inactive") is treated
// as no longer active. Kept separate from STAFF_STATUS_VALUES so the two
// lists can diverge (e.g. a future status that's a valid value but still
// blocks access).
const ACCESS_ALLOWED_STATUSES: readonly string[] = ["active", "on_leave"];

export function staffAllowsAccess(status: string): boolean {
  return ACCESS_ALLOWED_STATUSES.includes(status);
}
