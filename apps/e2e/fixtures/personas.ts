import path from "node:path";

// One entry per E2E persona login. The `super_admin` demo login and the
// five `qa.*` logins are seeded (idempotently) by
// apps/cloud-api/scripts/seed.ts -- see its QA_PERSONAS constant for the
// authoritative source of these credentials, including which role/staff
// assignment each one carries (e.g. classTeacher is a real class-teacher-
// of-a-section, subjectTeacher a real subject-assigned teacher, so
// ScopedAccessService's additive authorization paths have real data to
// exercise, not just the flat `teacher` permission set).
export const PERSONAS = {
  superAdmin: { email: "admin@demo.vidyalaya.in", password: "vidyalaya-demo", role: "super_admin" },
  branchAdmin: { email: "qa.branchadmin@demo.vidyalaya.in", password: "vidyalaya-qa-2026", role: "branch_admin" },
  accountant: { email: "qa.accountant@demo.vidyalaya.in", password: "vidyalaya-qa-2026", role: "accountant" },
  frontDesk: { email: "qa.frontdesk@demo.vidyalaya.in", password: "vidyalaya-qa-2026", role: "front_desk" },
  classTeacher: { email: "qa.classteacher@demo.vidyalaya.in", password: "vidyalaya-qa-2026", role: "teacher" },
  subjectTeacher: { email: "qa.subjectteacher@demo.vidyalaya.in", password: "vidyalaya-qa-2026", role: "teacher" },
} as const;

export type PersonaName = keyof typeof PERSONAS;

const AUTH_DIR = path.join(process.cwd(), ".auth");

export function authFilePath(persona: PersonaName): string {
  return path.join(AUTH_DIR, `${persona}.json`);
}

export { AUTH_DIR };
