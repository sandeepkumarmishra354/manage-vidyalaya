// Single source for the DPDP consent statement's version tag, shared by
// admission (guardian consent) and staff onboarding (self consent).
// Bump by hand if the consent wording in either frontend dialog ever
// changes materially, so a stored `consent_version` always identifies
// exactly what was agreed to -- not tied to a real versioned
// privacy-policy page, since none exists yet (that's the legal work,
// not code; see docs/production-readiness.md's DPDP section).
export const CONSENT_VERSION = "v1";
