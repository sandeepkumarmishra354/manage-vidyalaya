// Default LeaveType rows seeded per tenant -- Casual/Sick start with quota
// tracking on (a common baseline; the tenant configures actual quotas per
// staff category via LeaveTypeQuota) and "Other" is the freeform fallback,
// matching today's pre-feature behaviour (unlimited, always paid). Shared
// by scripts/seed.ts and scripts/create-tenant.ts, same pattern as
// DEFAULT_RETENTION_POLICIES.
export const DEFAULT_LEAVE_TYPES: { name: string; quotaEnabled: boolean }[] = [
  { name: "Casual Leave", quotaEnabled: true },
  { name: "Sick Leave", quotaEnabled: true },
  { name: "Other", quotaEnabled: false },
];
