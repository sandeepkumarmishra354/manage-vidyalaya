// Public sales/marketing demo tenant -- NOT an E2E fixture (see seed-e2e.ts)
// and NOT how real schools are onboarded (see create-tenant.ts). Provisions
// one fixed tenant at subdomain "demo" (intended to be reachable at
// https://demo.managevidya.in once DNS/routing for that subdomain is set up
// -- outside this script's scope) with hundreds of realistic rows across
// every module, plus several role-based persona logins, so a random visitor
// can log in and click around a populated instance of the product.
//
// One-shot, manually re-run: every run fully wipes and reseeds exactly this
// one tenant's rows (see resetDemoTenant below), so the demo always looks
// "freshly generated as of today" rather than accumulating duplicates or
// going stale. Safe to run against a shared dev/staging database since
// every row it touches is scoped to DEMO_TENANT_ID.
//
// Connects as the schema-owning role (DATABASE_URL, not APP_DATABASE_URL) --
// same reasoning as create-tenant.ts/seed-e2e.ts.
import "dotenv/config";

import { randomUUID } from "node:crypto";

import * as bcrypt from "bcryptjs";
import pg from "pg";
import type { PoolClient } from "pg";

import { SYSTEM_ROLE_PERMISSIONS } from "../src/common/permission-catalog.js";
import { FEE_TYPES } from "../src/fees/fee-type.js";
import { DEFAULT_LEAVE_TYPES } from "../src/leave-types/default-leave-types.js";
import { DEFAULT_RETENTION_POLICIES } from "../src/retention/retention-categories.js";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEMO_TENANT_ID = "11111111-1111-1111-1111-111111111111";
const DEMO_SUBDOMAIN = "demo";
const DEMO_SCHOOL_NAME = "Sunrise Public School";
const DEMO_PASSWORD = "Demo@1234";

const BRANCH_COUNT = 2;
const SECTIONS_PER_CLASS = 2;
const ATTENDANCE_WINDOW_DAYS = 90;
const LIBRARY_BOOK_COUNT = 150;
const EXPENSE_COUNT = 150;
const PAYROLL_MONTHS = 3;
const TRANSPORT_STUDENT_SHARE = 0.45;

const SYSTEM_ROLE_NAMES = ["super_admin", "branch_admin", "accountant", "teacher", "front_desk"] as const;

const DEFAULT_STAFF_CATEGORIES = [
  "Teacher",
  "Accountant",
  "Librarian",
  "Peon",
  "Driver",
  "Security Guard",
  "Admin Staff",
  "Nurse",
  "Lab Assistant",
  "Sports Coach",
];

const DEFAULT_FEE_CATEGORIES: { key: string; name: string }[] = FEE_TYPES.map((key) => ({
  key,
  name: key.charAt(0).toUpperCase() + key.slice(1),
}));

const DEFAULT_MASTER_DATA_ITEMS: { type: string; name: string }[] = [
  ...["General", "OBC", "SC", "ST", "Other"].map((name) => ({ type: "student_category", name })),
  ...["Male", "Female", "Other"].map((name) => ({ type: "gender", name })),
  ...["Father", "Mother", "Guardian"].map((name) => ({ type: "guardian_relation", name })),
  ...["Utilities", "Stationery", "Maintenance", "Transport & Fuel", "Miscellaneous"].map((name) => ({
    type: "expense_category",
    name,
  })),
];

// ---------------------------------------------------------------------------
// Name pools (hand-rolled -- no @faker-js/faker anywhere in this monorepo,
// not worth a new dependency for one script)
// ---------------------------------------------------------------------------

const FIRST_NAMES_MALE = [
  "Aarav", "Vihaan", "Aditya", "Ishaan", "Kabir", "Arjun", "Reyansh", "Vivaan", "Ayaan", "Krishna",
  "Rohan", "Aryan", "Dev", "Sai", "Yash", "Kunal", "Rahul", "Karan", "Nikhil", "Varun",
  "Siddharth", "Aniket", "Harsh", "Vikram", "Rajat", "Sameer", "Amit", "Suresh", "Rakesh", "Manoj",
  "Deepak", "Gaurav", "Tarun", "Pranav", "Akash",
];

const FIRST_NAMES_FEMALE = [
  "Ananya", "Diya", "Saanvi", "Aadhya", "Myra", "Ira", "Kavya", "Riya", "Anika", "Navya",
  "Isha", "Sneha", "Pooja", "Priya", "Neha", "Kavita", "Anjali", "Meera", "Shreya", "Tanvi",
  "Nisha", "Ritu", "Swati", "Pallavi", "Divya", "Aditi", "Bhavya", "Charvi", "Esha", "Gauri",
  "Hina", "Jiya", "Kritika", "Lavanya", "Mahi",
];

const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Reddy", "Nair", "Khan", "Iyer", "Singh", "Patel", "Das",
  "Mehta", "Kapoor", "Joshi", "Rao", "Bhat", "Chauhan", "Malhotra", "Bansal", "Agarwal", "Chopra",
  "Mishra", "Pandey", "Tiwari", "Yadav", "Saxena", "Kulkarni", "Desai", "Pillai", "Menon", "Naidu",
  "Shetty", "Thakur", "Gill", "Sethi", "Bhatt",
];

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function pickWeighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [value, weight] of pairs) {
    if (r < weight) return value;
    r -= weight;
  }
  return pairs[pairs.length - 1][0];
}

function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 24 * 60 * 60 * 1000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function randomDateBetween(start: Date, end: Date): Date {
  if (end <= start) return new Date(start);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomPersonName(gender: "Male" | "Female"): { first: string; last: string } {
  const first = gender === "Male" ? pickRandom(FIRST_NAMES_MALE) : pickRandom(FIRST_NAMES_FEMALE);
  return { first, last: pickRandom(LAST_NAMES) };
}

function randomPhone(): string {
  return `9${String(randInt(100000000, 999999999))}`;
}

function padSeq(n: number, width = 4): string {
  return String(n).padStart(width, "0");
}

function rupeesToPaise(rupees: number): number {
  return rupees * 100;
}

// Indian academic year convention: April-to-March, copied from
// create-tenant.ts/seed-e2e.ts (kept as its own copy, same reasoning those
// two files already state).
function currentAcademicYearBounds(now: Date): { name: string; startDate: Date; endDate: Date } {
  const aprilIndex = 3;
  const startYear = now.getUTCMonth() >= aprilIndex ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return {
    name: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
    startDate: new Date(Date.UTC(startYear, aprilIndex, 1)),
    endDate: new Date(Date.UTC(startYear + 1, aprilIndex, 0)),
  };
}

type DayType = "holiday" | "half_day" | "working";

// Replicates SchoolCalendarService.getDayTypesInRange's exact precedence
// (dated override > weekly rule > default "working") so seeded attendance/
// payroll match what the real service would compute for the same calendar.
function computeDayTypes(
  startDate: Date,
  endDate: Date,
  sessionStart: Date,
  sessionEnd: Date,
  weeklyOffDays: number[],
  weeklyHalfDays: number[],
  holidaysByIso: Map<string, DayType>,
): Map<string, DayType> {
  const result = new Map<string, DayType>();
  for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
    const iso = isoDate(d);
    if (d < sessionStart || d > sessionEnd) {
      result.set(iso, "working");
      continue;
    }
    const override = holidaysByIso.get(iso);
    if (override) {
      result.set(iso, override);
      continue;
    }
    const dow = d.getUTCDay();
    if (weeklyOffDays.includes(dow)) result.set(iso, "holiday");
    else if (weeklyHalfDays.includes(dow)) result.set(iso, "half_day");
    else result.set(iso, "working");
  }
  return result;
}

function dayWeight(type: DayType): number {
  return type === "holiday" ? 0 : 1;
}

// Batches rows into multi-row INSERT ... VALUES (...),(...) statements
// (chunked well under Postgres's parameter limit) -- a plain one-row-per-
// query loop across the tens of thousands of rows this script writes would
// be needlessly slow over a real network-hop DB connection.
async function batchInsert(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  chunkSize = 500,
): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values: unknown[] = [];
    const tuples = chunk.map((row, rowIdx) => {
      const base = rowIdx * columns.length;
      values.push(...row);
      return `(${columns.map((_, colIdx) => `$${base + colIdx + 1}`).join(",")})`;
    });
    await client.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")}`, values);
  }
}

// ---------------------------------------------------------------------------
// Reset: every table this script writes to, deepest dependency first, so a
// re-run always starts from a clean slate for exactly this one tenant.
// ---------------------------------------------------------------------------

const DEMO_TABLES_FORWARD_ORDER = [
  "tenants", "branches", "academic_sessions", "roles", "role_permissions",
  "staff_categories", "leave_types", "fee_categories", "master_data_items", "retention_policies",
  "subjects", "classes", "sections", "class_subjects", "houses",
  "users", "staff", "user_roles",
  "students", "guardians", "student_guardians", "admissions",
  "student_houses", "house_point_events", "school_calendars", "calendar_holidays",
  "attendance_records", "staff_attendance",
  "period_slots", "teacher_subject_assignments", "timetable_entries",
  "exams", "exam_marks",
  "fee_structures", "fee_invoices", "fee_payments",
  "salary_structures", "salary_components", "payroll_runs", "payslips", "payslip_line_items",
  "expenses", "staff_leave_requests",
  "library_books", "library_issues",
  "transport_routes", "transport_stops", "student_transport",
];

async function resetDemoTenant(client: PoolClient): Promise<void> {
  for (const table of [...DEMO_TABLES_FORWARD_ORDER].reverse()) {
    if (table === "tenants") {
      await client.query("DELETE FROM tenants WHERE id = $1", [DEMO_TENANT_ID]);
    } else {
      await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [DEMO_TENANT_ID]);
    }
  }
}

// ---------------------------------------------------------------------------
// Academic structure
// ---------------------------------------------------------------------------

const CLASS_DEFS = [
  { name: "Nursery", ageYears: 3.5 },
  { name: "LKG", ageYears: 4.5 },
  { name: "UKG", ageYears: 5.5 },
  { name: "Class I", ageYears: 6.5 },
  { name: "Class II", ageYears: 7.5 },
  { name: "Class III", ageYears: 8.5 },
  { name: "Class IV", ageYears: 9.5 },
  { name: "Class V", ageYears: 10.5 },
  { name: "Class VI", ageYears: 11.5 },
  { name: "Class VII", ageYears: 12.5 },
];

const SUBJECT_NAMES = [
  "English", "Hindi", "Mathematics", "Science", "Social Studies", "Computer Science", "Physical Education", "Art",
];

const HOUSE_DEFS = [
  { name: "Agni", color: "#ef4444" },
  { name: "Prithvi", color: "#22c55e" },
  { name: "Jal", color: "#3b82f6" },
  { name: "Vayu", color: "#eab308" },
];

const PERIOD_SLOT_DEFS = [
  { name: "Period 1", start: "08:00", end: "08:45", type: "teaching" },
  { name: "Period 2", start: "08:45", end: "09:30", type: "teaching" },
  { name: "Period 3", start: "09:30", end: "10:15", type: "teaching" },
  { name: "Recess", start: "10:15", end: "10:45", type: "break" },
  { name: "Period 4", start: "10:45", end: "11:30", type: "teaching" },
  { name: "Period 5", start: "11:30", end: "12:15", type: "teaching" },
  { name: "Period 6", start: "12:15", end: "13:00", type: "teaching" },
  { name: "Period 7", start: "13:00", end: "13:45", type: "teaching" },
];

interface BranchInfo {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
}

const BRANCH_DEFS: Omit<BranchInfo, "id">[] = [
  { name: "Main Campus", code: "MAIN", city: "New Delhi", state: "Delhi" },
  { name: "North Campus", code: "NORTH", city: "Gurugram", state: "Haryana" },
];

interface ClassInfo {
  id: string;
  branchId: string;
  name: string;
  sortOrder: number;
  ageYears: number;
}

interface SectionInfo {
  id: string;
  classId: string;
  branchId: string;
  name: string;
}

interface SubjectInfo {
  id: string;
  branchId: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Staff plan
// ---------------------------------------------------------------------------

interface PersonaDef {
  email: string;
  fullName: string;
  gender: "Male" | "Female";
  designation: string;
  categoryName: string;
  roleName: (typeof SYSTEM_ROLE_NAMES)[number];
  branchIndex: number | null; // null = tenant-wide (super_admin)
  status: "active" | "on_leave";
  isPrincipal: boolean;
}

const PERSONA_DEFS: PersonaDef[] = [
  {
    email: "admin@demo.managevidya.in",
    fullName: "Anjali Mehta",
    gender: "Female",
    designation: "Principal",
    categoryName: "Admin Staff",
    roleName: "super_admin",
    branchIndex: null,
    status: "active",
    isPrincipal: true,
  },
  {
    email: "branchadmin@demo.managevidya.in",
    fullName: "Rohan Kapoor",
    gender: "Male",
    designation: "Branch Administrator",
    categoryName: "Admin Staff",
    roleName: "branch_admin",
    branchIndex: 1,
    status: "active",
    isPrincipal: false,
  },
  {
    email: "accountant@demo.managevidya.in",
    fullName: "Priya Nair",
    gender: "Female",
    designation: "Accountant",
    categoryName: "Accountant",
    roleName: "accountant",
    branchIndex: 0,
    status: "active",
    isPrincipal: false,
  },
  {
    email: "teacher@demo.managevidya.in",
    fullName: "Sameer Joshi",
    gender: "Male",
    designation: "Teacher",
    categoryName: "Teacher",
    roleName: "teacher",
    branchIndex: 0,
    status: "active",
    isPrincipal: false,
  },
  {
    email: "frontdesk@demo.managevidya.in",
    fullName: "Kavita Rao",
    gender: "Female",
    designation: "Front Desk Executive",
    categoryName: "Admin Staff",
    roleName: "front_desk",
    branchIndex: 0,
    status: "active",
    isPrincipal: false,
  },
  {
    email: "teacher2@demo.managevidya.in",
    fullName: "Neha Bhatt",
    gender: "Female",
    designation: "Teacher",
    categoryName: "Teacher",
    roleName: "teacher",
    branchIndex: 1,
    status: "on_leave",
    isPrincipal: false,
  },
];

const BULK_STAFF_PLAN: { designation: string; category: string; count: number }[] = [
  { designation: "Teacher", category: "Teacher", count: 17 },
  { designation: "Accountant", category: "Accountant", count: 1 },
  { designation: "Librarian", category: "Librarian", count: 1 },
  { designation: "Peon", category: "Peon", count: 3 },
  { designation: "Driver", category: "Driver", count: 6 },
  { designation: "Security Guard", category: "Security Guard", count: 2 },
  { designation: "Admin Staff", category: "Admin Staff", count: 1 },
  { designation: "Nurse", category: "Nurse", count: 1 },
  { designation: "Lab Assistant", category: "Lab Assistant", count: 1 },
  { designation: "Sports Coach", category: "Sports Coach", count: 1 },
];

const DESIGNATION_SALARY_BAND: Record<string, [number, number]> = {
  Principal: [70000, 90000],
  "Branch Administrator": [45000, 55000],
  Accountant: [30000, 42000],
  Teacher: [30000, 45000],
  "Front Desk Executive": [20000, 28000],
  Librarian: [22000, 28000],
  Peon: [12000, 16000],
  Driver: [18000, 22000],
  "Security Guard": [15000, 19000],
  "Admin Staff": [20000, 28000],
  Nurse: [22000, 28000],
  "Lab Assistant": [18000, 24000],
  "Sports Coach": [20000, 28000],
};

interface StaffInfo {
  id: string;
  branchId: string;
  branchIndex: number;
  userId: string | null;
  employeeCode: string;
  firstName: string;
  lastName: string;
  gender: "Male" | "Female";
  phone: string;
  designation: string;
  categoryName: string;
  dateOfJoining: Date;
  status: "active" | "on_leave" | "relieved";
  isTeacher: boolean;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const now = new Date();

  try {
    await client.query("BEGIN");

    const { rows: conflicting } = await client.query<{ id: string }>(
      "SELECT id FROM tenants WHERE subdomain = $1 AND id != $2",
      [DEMO_SUBDOMAIN, DEMO_TENANT_ID],
    );
    if (conflicting.length > 0) {
      throw new Error(`Subdomain "${DEMO_SUBDOMAIN}" is already taken by tenant ${conflicting[0].id}.`);
    }

    await client.query("SELECT set_config('app.tenant_id', $1, true)", [DEMO_TENANT_ID]);
    await resetDemoTenant(client);

    // ---- Phase 1: tenant / branch / session / RBAC / catalogs -----------

    await client.query(
      `INSERT INTO tenants (id, name, subdomain, subscription_status, plan_tier, trial_ends_at, is_suspended, updated_at)
       VALUES ($1, $2, $3, 'active', 'gold', NULL, false, $4)`,
      [DEMO_TENANT_ID, DEMO_SCHOOL_NAME, DEMO_SUBDOMAIN, now],
    );

    const branches: BranchInfo[] = BRANCH_DEFS.map((b) => ({ ...b, id: randomUUID() }));
    await batchInsert(
      client,
      "branches",
      ["id", "tenant_id", "name", "code", "city", "state", "updated_at"],
      branches.map((b) => [b.id, DEMO_TENANT_ID, b.name, b.code, b.city, b.state, now]),
    );

    const session = currentAcademicYearBounds(now);
    const sessionId = randomUUID();
    await client.query(
      `INSERT INTO academic_sessions (id, tenant_id, name, start_date, end_date, is_current, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, $6)`,
      [sessionId, DEMO_TENANT_ID, session.name, session.startDate, session.endDate, now],
    );

    const roleIds = new Map<string, string>();
    for (const roleName of SYSTEM_ROLE_NAMES) {
      const roleId = randomUUID();
      roleIds.set(roleName, roleId);
      await client.query(
        `INSERT INTO roles (id, tenant_id, name, is_system, updated_at) VALUES ($1, $2, $3, true, $4)`,
        [roleId, DEMO_TENANT_ID, roleName, now],
      );
      await batchInsert(
        client,
        "role_permissions",
        ["id", "tenant_id", "role_id", "permission_key", "updated_at"],
        SYSTEM_ROLE_PERMISSIONS[roleName].map((key) => [randomUUID(), DEMO_TENANT_ID, roleId, key, now]),
      );
    }

    const staffCategoryIds = new Map<string, string>();
    for (const name of DEFAULT_STAFF_CATEGORIES) {
      const id = randomUUID();
      staffCategoryIds.set(name, id);
      await client.query(
        `INSERT INTO staff_categories (id, tenant_id, name, is_system, updated_at) VALUES ($1, $2, $3, true, $4)`,
        [id, DEMO_TENANT_ID, name, now],
      );
    }

    const leaveTypeIds = new Map<string, string>();
    for (const { name, quotaEnabled } of DEFAULT_LEAVE_TYPES) {
      const id = randomUUID();
      leaveTypeIds.set(name, id);
      await client.query(
        `INSERT INTO leave_types (id, tenant_id, name, is_system, quota_enabled, updated_at)
         VALUES ($1, $2, $3, true, $4, $5)`,
        [id, DEMO_TENANT_ID, name, quotaEnabled, now],
      );
    }

    for (const { key, name } of DEFAULT_FEE_CATEGORIES) {
      await client.query(
        `INSERT INTO fee_categories (id, tenant_id, key, name, is_system, updated_at) VALUES ($1, $2, $3, $4, true, $5)`,
        [randomUUID(), DEMO_TENANT_ID, key, name, now],
      );
    }

    const masterDataIds = new Map<string, string>();
    for (const { type, name } of DEFAULT_MASTER_DATA_ITEMS) {
      const id = randomUUID();
      masterDataIds.set(`${type}:${name}`, id);
      await client.query(
        `INSERT INTO master_data_items (id, tenant_id, type, name, is_system, updated_at) VALUES ($1, $2, $3, $4, true, $5)`,
        [id, DEMO_TENANT_ID, type, name, now],
      );
    }

    for (const policy of DEFAULT_RETENTION_POLICIES) {
      await client.query(
        `INSERT INTO retention_policies (id, tenant_id, category, retention_years, is_active, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), DEMO_TENANT_ID, policy.category, policy.retention_years, policy.is_active, now],
      );
    }

    // module_settings intentionally not seeded -- a missing row defaults to
    // enabled, and Gold's eligible-module set already includes all 7.

    // ---- Phase 2: subjects / classes / sections / class_subjects / houses

    const subjects: SubjectInfo[] = [];
    for (const branch of branches) {
      for (const name of SUBJECT_NAMES) {
        subjects.push({ id: randomUUID(), branchId: branch.id, name });
      }
    }
    await batchInsert(
      client,
      "subjects",
      ["id", "tenant_id", "branch_id", "name", "updated_at"],
      subjects.map((s) => [s.id, DEMO_TENANT_ID, s.branchId, s.name, now]),
    );

    const classes: ClassInfo[] = [];
    CLASS_DEFS.forEach((def, idx) => {
      const branchIdx = idx < 5 ? 0 : 1;
      const sortOrder = idx < 5 ? idx : idx - 5;
      classes.push({
        id: randomUUID(),
        branchId: branches[branchIdx].id,
        name: def.name,
        sortOrder,
        ageYears: def.ageYears,
      });
    });
    await batchInsert(
      client,
      "classes",
      ["id", "tenant_id", "branch_id", "academic_session_id", "name", "sort_order", "updated_at"],
      classes.map((c) => [c.id, DEMO_TENANT_ID, c.branchId, sessionId, c.name, c.sortOrder, now]),
    );

    const sections: SectionInfo[] = [];
    for (const cls of classes) {
      for (const sectionName of ["A", "B"].slice(0, SECTIONS_PER_CLASS)) {
        sections.push({ id: randomUUID(), classId: cls.id, branchId: cls.branchId, name: sectionName });
      }
    }
    await batchInsert(
      client,
      "sections",
      ["id", "tenant_id", "class_id", "name", "updated_at"],
      sections.map((s) => [s.id, DEMO_TENANT_ID, s.classId, s.name, now]),
    );

    const classSubjectRows: unknown[][] = [];
    const classSubjectIdByKey = new Map<string, string>(); // `${classId}:${subjectId}` -> class_subjects.id
    for (const cls of classes) {
      const branchSubjects = subjects.filter((s) => s.branchId === cls.branchId);
      for (const subject of branchSubjects) {
        const id = randomUUID();
        const isElective = subject.name === "Art" && cls.ageYears >= 8.5;
        classSubjectIdByKey.set(`${cls.id}:${subject.id}`, id);
        classSubjectRows.push([id, DEMO_TENANT_ID, cls.branchId, cls.id, subject.id, isElective, now]);
      }
    }
    await batchInsert(
      client,
      "class_subjects",
      ["id", "tenant_id", "branch_id", "class_id", "subject_id", "is_elective", "updated_at"],
      classSubjectRows,
    );

    const housesByBranch = new Map<string, { id: string; name: string }[]>();
    const houseRows: unknown[][] = [];
    for (const branch of branches) {
      const list: { id: string; name: string }[] = [];
      for (const def of HOUSE_DEFS) {
        const id = randomUUID();
        list.push({ id, name: def.name });
        houseRows.push([id, DEMO_TENANT_ID, branch.id, def.name, def.color, now]);
      }
      housesByBranch.set(branch.id, list);
    }
    await batchInsert(client, "houses", ["id", "tenant_id", "branch_id", "name", "color", "updated_at"], houseRows);

    // ---- Phase 3: persona logins + bulk staff ----------------------------

    const personaHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const personaUserIds = new Map<string, string>(); // email -> user id
    const personaStaffIds = new Map<string, string>(); // email -> staff id
    const staff: StaffInfo[] = [];
    const staffSeqByBranch = [1, 1];

    for (const persona of PERSONA_DEFS) {
      const branchIdx = persona.branchIndex;
      const branchId = branchIdx === null ? null : branches[branchIdx].id;
      const userId = randomUUID();
      personaUserIds.set(persona.email, userId);
      await client.query(
        `INSERT INTO users (id, tenant_id, branch_id, full_name, email, password_hash, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, DEMO_TENANT_ID, branchId, persona.fullName, persona.email, personaHash, now],
      );

      // Every persona (super_admin included) gets a real staff row so the
      // demo exercises assertLinkedStaffAllowsAccess exactly like a real
      // login, plus a home branch for its own staff record even when the
      // user account itself is tenant-wide.
      const homeBranchIdx = branchIdx ?? 0;
      const homeBranch = branches[homeBranchIdx];
      const staffId = randomUUID();
      personaStaffIds.set(persona.email, staffId);
      const [first, ...lastParts] = persona.fullName.split(" ");
      const lastName = lastParts.join(" ");
      const employeeCode = `${homeBranch.code}-${padSeq(staffSeqByBranch[homeBranchIdx]++)}`;
      const dateOfJoining = addDays(now, -randInt(365, 365 * 6));

      await client.query(
        `INSERT INTO staff (id, tenant_id, branch_id, user_id, employee_code, first_name, last_name, gender, phone,
                             designation, department, date_of_joining, status, category_id, is_principal, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          staffId,
          DEMO_TENANT_ID,
          homeBranch.id,
          userId,
          employeeCode,
          first,
          lastName,
          persona.gender,
          randomPhone(),
          persona.designation,
          null,
          dateOfJoining,
          persona.status,
          staffCategoryIds.get(persona.categoryName) ?? null,
          persona.isPrincipal,
          now,
        ],
      );

      await client.query(
        `INSERT INTO user_roles (id, tenant_id, user_id, role_id, updated_at) VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), DEMO_TENANT_ID, userId, roleIds.get(persona.roleName), now],
      );

      staff.push({
        id: staffId,
        branchId: homeBranch.id,
        branchIndex: homeBranchIdx,
        userId,
        employeeCode,
        firstName: first,
        lastName,
        gender: persona.gender,
        phone: randomPhone(),
        designation: persona.designation,
        categoryName: persona.categoryName,
        dateOfJoining,
        status: persona.status,
        isTeacher: persona.roleName === "teacher",
      });
    }

    // Set the section-A of branch 0's first class's class teacher to the
    // teacher@ persona -- deferred until now since sections were inserted
    // before any staff row existed to reference.
    const branch0FirstClassSectionA = sections.find(
      (s) => s.branchId === branches[0].id && s.name === "A" && classes.find((c) => c.id === s.classId)?.branchId === branches[0].id,
    );
    const teacherPersonaStaffId = personaStaffIds.get("teacher@demo.managevidya.in");
    if (branch0FirstClassSectionA && teacherPersonaStaffId) {
      await client.query("UPDATE sections SET class_teacher_staff_id = $1, updated_at = $2 WHERE id = $3", [
        teacherPersonaStaffId,
        now,
        branch0FirstClassSectionA.id,
      ]);
    }

    const bulkStaffRows: unknown[][] = [];
    let driverCounter = 0;
    let bulkStaffCounter = 0;
    const drivers: { id: string; name: string; phone: string }[] = [];
    for (const plan of BULK_STAFF_PLAN) {
      for (let i = 0; i < plan.count; i++) {
        const branchIdx = bulkStaffCounter % BRANCH_COUNT;
        bulkStaffCounter++;
        const branch = branches[branchIdx];
        const gender: "Male" | "Female" = Math.random() < 0.5 ? "Male" : "Female";
        const { first, last } = randomPersonName(gender);
        const id = randomUUID();
        const employeeCode = `${branch.code}-${padSeq(staffSeqByBranch[branchIdx]++)}`;
        const dateOfJoining = addDays(now, -randInt(120, 365 * 8));
        // One driver every so often ends up "relieved" or "on_leave" purely
        // for realism in HR reports/filters -- most stay active.
        const status: "active" | "on_leave" | "relieved" =
          i === 0 && plan.designation === "Peon" ? "relieved" : Math.random() < 0.05 ? "on_leave" : "active";
        const phone = randomPhone();

        bulkStaffRows.push([
          id,
          DEMO_TENANT_ID,
          branch.id,
          null,
          employeeCode,
          first,
          last,
          gender,
          phone,
          plan.designation,
          null,
          dateOfJoining,
          status,
          staffCategoryIds.get(plan.category) ?? null,
          false,
          now,
        ]);

        staff.push({
          id,
          branchId: branch.id,
          branchIndex: branchIdx,
          userId: null,
          employeeCode,
          firstName: first,
          lastName: last,
          gender,
          phone,
          designation: plan.designation,
          categoryName: plan.category,
          dateOfJoining,
          status,
          isTeacher: plan.designation === "Teacher",
        });

        if (plan.designation === "Driver" && driverCounter < 6) {
          drivers.push({ id, name: `${first} ${last}`, phone });
          driverCounter++;
        }
      }
    }
    await batchInsert(
      client,
      "staff",
      [
        "id", "tenant_id", "branch_id", "user_id", "employee_code", "first_name", "last_name", "gender", "phone",
        "designation", "department", "date_of_joining", "status", "category_id", "is_principal", "updated_at",
      ],
      bulkStaffRows,
    );

    const teachers = staff.filter((s) => s.isTeacher);

    // ---- Phase 3b: teacher_subject_assignments (needed before timetable) -

    const teacherByClassSubject = new Map<string, StaffInfo>(); // `${classId}:${subjectId}` -> staff
    const tsaRows: unknown[][] = [];
    for (const cls of classes) {
      const branchTeachers = teachers.filter((t) => t.branchId === cls.branchId);
      if (branchTeachers.length === 0) continue;
      const branchSubjects = subjects.filter((s) => s.branchId === cls.branchId);
      branchSubjects.forEach((subject, subjectIdx) => {
        const teacher = branchTeachers[(cls.sortOrder * branchSubjects.length + subjectIdx) % branchTeachers.length];
        teacherByClassSubject.set(`${cls.id}:${subject.id}`, teacher);
        tsaRows.push([
          randomUUID(), DEMO_TENANT_ID, cls.branchId, teacher.id, cls.id, null, subject.id, sessionId, now,
        ]);
      });
    }
    await batchInsert(
      client,
      "teacher_subject_assignments",
      ["id", "tenant_id", "branch_id", "staff_id", "class_id", "section_id", "subject_id", "academic_session_id", "updated_at"],
      tsaRows,
    );

    // ---- Phase 4: students / guardians / admissions ----------------------

    interface StudentInfo {
      id: string;
      branchId: string;
      classId: string | null;
      sectionId: string | null;
      status: "enrolled" | "applied" | "withdrawn";
      admissionNumber: string | null;
      firstName: string;
      lastName: string;
      gender: "Male" | "Female";
    }

    const students: StudentInfo[] = [];
    const admissionSeqByBranch = [1, 1];
    const year = now.getUTCFullYear();

    const sectionsByClass = new Map<string, SectionInfo[]>();
    for (const section of sections) {
      const list = sectionsByClass.get(section.classId) ?? [];
      list.push(section);
      sectionsByClass.set(section.classId, list);
    }

    // 290 enrolled, spread across the 20 sections (10 sections get 15, 10
    // get 14 -> exactly 290), plus 8 applied (no class yet) and 2 withdrawn.
    let sectionIdx = 0;
    for (const cls of classes) {
      const classSections = sectionsByClass.get(cls.id) ?? [];
      for (const section of classSections) {
        const count = sectionIdx < 10 ? 15 : 14;
        sectionIdx++;
        for (let i = 0; i < count; i++) {
          const gender: "Male" | "Female" = Math.random() < 0.5 ? "Male" : "Female";
          const { first, last } = randomPersonName(gender);
          const branchIdx = branches.findIndex((b) => b.id === cls.branchId);
          const admissionNumber = `${branches[branchIdx].code}-${year}-${padSeq(admissionSeqByBranch[branchIdx]++)}`;
          students.push({
            id: randomUUID(),
            branchId: cls.branchId,
            classId: cls.id,
            sectionId: section.id,
            status: "enrolled",
            admissionNumber,
            firstName: first,
            lastName: last,
            gender,
          });
        }
      }
    }

    for (let i = 0; i < 8; i++) {
      const gender: "Male" | "Female" = Math.random() < 0.5 ? "Male" : "Female";
      const { first, last } = randomPersonName(gender);
      const branch = branches[i % BRANCH_COUNT];
      students.push({
        id: randomUUID(),
        branchId: branch.id,
        classId: null,
        sectionId: null,
        status: "applied",
        admissionNumber: null,
        firstName: first,
        lastName: last,
        gender,
      });
    }

    for (let i = 0; i < 2; i++) {
      const gender: "Male" | "Female" = Math.random() < 0.5 ? "Male" : "Female";
      const { first, last } = randomPersonName(gender);
      const cls = classes[i];
      const branchIdx = branches.findIndex((b) => b.id === cls.branchId);
      const admissionNumber = `${branches[branchIdx].code}-${year}-${padSeq(admissionSeqByBranch[branchIdx]++)}`;
      students.push({
        id: randomUUID(),
        branchId: cls.branchId,
        classId: null,
        sectionId: null,
        status: "withdrawn",
        admissionNumber,
        firstName: first,
        lastName: last,
        gender,
      });
    }

    const studentRows: unknown[][] = students.map((s) => {
      const ageYears = classes.find((c) => c.id === s.classId)?.ageYears ?? 8;
      const dob = addDays(now, -Math.round((ageYears + (Math.random() - 0.5)) * 365));
      const isWithdrawn = s.status === "withdrawn";
      return [
        s.id, DEMO_TENANT_ID, s.branchId, s.admissionNumber, s.firstName, s.lastName, dob, s.gender,
        pickRandom(BLOOD_GROUPS), s.classId, s.sectionId, s.status,
        `${randInt(1, 200)} ${pickRandom(["MG Road", "Park Street", "Civil Lines", "Model Town", "Sector " + randInt(1, 60)])}`,
        branches.find((b) => b.id === s.branchId)?.city ?? "New Delhi",
        branches.find((b) => b.id === s.branchId)?.state ?? "Delhi",
        s.classId ? String(randInt(1, 40)) : null,
        isWithdrawn ? addDays(now, -randInt(10, 60)) : null,
        isWithdrawn ? `TC-${padSeq(randInt(1, 999))}` : null,
        isWithdrawn ? addDays(now, -randInt(10, 60)) : null,
        now,
      ];
    });
    await batchInsert(
      client,
      "students",
      [
        "id", "tenant_id", "branch_id", "admission_number", "first_name", "last_name", "date_of_birth", "gender",
        "blood_group", "current_class_id", "current_section_id", "status", "address", "city", "state",
        "roll_number", "date_of_leaving", "tc_number", "tc_issue_date", "updated_at",
      ],
      studentRows,
    );

    // Guardians: Father+Mother for most students, a single "Guardian" for
    // some, with a handful of students sharing a guardian pair (siblings).
    const guardianRows: unknown[][] = [];
    const studentGuardianRows: unknown[][] = [];
    let previousPair: { fatherId: string; motherId: string; lastName: string } | null = null;

    students.forEach((student, idx) => {
      const shareWithPrevious = previousPair && idx % 20 === 19;
      if (shareWithPrevious && previousPair) {
        studentGuardianRows.push([randomUUID(), DEMO_TENANT_ID, student.id, previousPair.fatherId, "Father", true, now]);
        studentGuardianRows.push([randomUUID(), DEMO_TENANT_ID, student.id, previousPair.motherId, "Mother", false, now]);
        return;
      }

      const familyLastName = student.lastName;
      if (Math.random() < 0.85) {
        const fatherId = randomUUID();
        const motherId = randomUUID();
        const fatherName = `${pickRandom(FIRST_NAMES_MALE)} ${familyLastName}`;
        const motherName = `${pickRandom(FIRST_NAMES_FEMALE)} ${familyLastName}`;
        guardianRows.push([fatherId, DEMO_TENANT_ID, fatherName, "Father", randomPhone(), `${fatherName.replace(/\s+/g, ".").toLowerCase()}@example.com`, pickRandom(["Business", "Private Job", "Government Job", "Self-Employed"]), now]);
        guardianRows.push([motherId, DEMO_TENANT_ID, motherName, "Mother", randomPhone(), `${motherName.replace(/\s+/g, ".").toLowerCase()}@example.com`, pickRandom(["Homemaker", "Private Job", "Government Job", "Business"]), now]);
        studentGuardianRows.push([randomUUID(), DEMO_TENANT_ID, student.id, fatherId, "Father", true, now]);
        studentGuardianRows.push([randomUUID(), DEMO_TENANT_ID, student.id, motherId, "Mother", false, now]);
        previousPair = { fatherId, motherId, lastName: familyLastName };
      } else {
        const guardianId = randomUUID();
        const gName = `${pickRandom(FIRST_NAMES_MALE)} ${familyLastName}`;
        guardianRows.push([guardianId, DEMO_TENANT_ID, gName, "Guardian", randomPhone(), `${gName.replace(/\s+/g, ".").toLowerCase()}@example.com`, "Business", now]);
        studentGuardianRows.push([randomUUID(), DEMO_TENANT_ID, student.id, guardianId, "Guardian", true, now]);
      }
    });

    await batchInsert(
      client,
      "guardians",
      ["id", "tenant_id", "full_name", "relation", "phone", "email", "occupation", "updated_at"],
      guardianRows,
    );
    await batchInsert(
      client,
      "student_guardians",
      ["id", "tenant_id", "student_id", "guardian_id", "relation", "is_primary_contact", "updated_at"],
      studentGuardianRows,
    );

    const adminPersonaUserId = personaUserIds.get("admin@demo.managevidya.in") ?? null;
    const admissionRows: unknown[][] = students.map((s) => {
      const stage = s.status === "applied" ? "applied" : "enrolled";
      const appliedAt = addDays(now, -randInt(30, 200));
      return [
        randomUUID(), DEMO_TENANT_ID, s.branchId, s.id, s.classId, sessionId, stage, appliedAt,
        stage === "enrolled" ? addDays(appliedAt, randInt(1, 10)) : null,
        stage === "enrolled" ? adminPersonaUserId : null,
        now,
      ];
    });
    await batchInsert(
      client,
      "admissions",
      ["id", "tenant_id", "branch_id", "student_id", "applied_class_id", "academic_session_id", "stage", "applied_at", "decided_at", "decided_by", "updated_at"],
      admissionRows,
    );

    const enrolledStudents = students.filter((s) => s.status === "enrolled");

    // Transport riders picked once, up front, so the fee-invoice phase and
    // the transport-assignment phase agree on who's actually riding the bus.
    const transportRiderIds = new Set<string>();
    for (const s of enrolledStudents) {
      if (Math.random() < TRANSPORT_STUDENT_SHARE) transportRiderIds.add(s.id);
    }

    // ---- Phase 5: houses / school calendar / holidays --------------------

    const studentHouseRows: unknown[][] = [];
    const housePointRows: unknown[][] = [];
    for (const student of enrolledStudents) {
      const branchHouses = housesByBranch.get(student.branchId) ?? [];
      if (branchHouses.length === 0) continue;
      const house = pickRandom(branchHouses);
      studentHouseRows.push([randomUUID(), DEMO_TENANT_ID, student.id, house.id, now]);
    }
    await batchInsert(client, "student_houses", ["id", "tenant_id", "student_id", "house_id", "updated_at"], studentHouseRows);

    for (const branch of branches) {
      const branchHouses = housesByBranch.get(branch.id) ?? [];
      for (let i = 0; i < 25; i++) {
        const house = pickRandom(branchHouses);
        const eventStudents = enrolledStudents.filter((s) => s.branchId === branch.id);
        if (eventStudents.length === 0) continue;
        const student = pickRandom(eventStudents);
        housePointRows.push([
          randomUUID(), DEMO_TENANT_ID, branch.id, house.id, student.id, sessionId,
          pickWeighted<number>([[5, 3], [10, 2], [-5, 1]]),
          pickRandom(["Inter-house quiz", "Sports meet", "Cleanliness drive", "Debate competition", "Discipline"]),
          addDays(now, -randInt(1, 80)), adminPersonaUserId, now,
        ]);
      }
    }
    await batchInsert(
      client,
      "house_point_events",
      ["id", "tenant_id", "branch_id", "house_id", "student_id", "academic_session_id", "points", "reason", "event_date", "awarded_by", "updated_at"],
      housePointRows,
    );

    const calendarIdByBranch = new Map<string, string>();
    const calendarHolidayRows: unknown[][] = [];
    const holidaysByBranchIso = new Map<string, Map<string, DayType>>();
    for (const branch of branches) {
      const calendarId = randomUUID();
      calendarIdByBranch.set(branch.id, calendarId);
      await client.query(
        `INSERT INTO school_calendars (id, tenant_id, branch_id, academic_session_id, weekly_off_days, weekly_half_days, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [calendarId, DEMO_TENANT_ID, branch.id, sessionId, [0], [6], now],
      );

      const holidayDate1 = addDays(now, -50);
      const holidayDate2 = addDays(now, -25);
      const isoMap = new Map<string, DayType>();
      isoMap.set(isoDate(holidayDate1), "holiday");
      isoMap.set(isoDate(holidayDate2), "half_day");
      holidaysByBranchIso.set(branch.id, isoMap);

      calendarHolidayRows.push([randomUUID(), DEMO_TENANT_ID, calendarId, holidayDate1, "Festival Holiday", "holiday", now]);
      calendarHolidayRows.push([randomUUID(), DEMO_TENANT_ID, calendarId, holidayDate2, "Exam Prep Half Day", "half_day", now]);
    }
    await batchInsert(
      client,
      "calendar_holidays",
      ["id", "tenant_id", "school_calendar_id", "date", "name", "type", "updated_at"],
      calendarHolidayRows,
    );

    // ---- Phase 6: leave plan (computed before attendance so approved leave
    // dates can be folded into staff_attendance directly, avoiding a unique-
    // constraint clash with the random attendance generated below) ---------

    interface LeavePlanItem {
      staff: StaffInfo;
      leaveTypeName: string;
      startDate: Date;
      endDate: Date;
      status: "approved" | "pending" | "rejected";
      reason: string;
    }
    const activeStaffPool = staff.filter((s) => s.status === "active");
    const leavePlan: LeavePlanItem[] = [];
    const leaveOverrides = new Map<string, "leave">(); // `${staffId}:${iso}` -> status

    for (let i = 0; i < 18; i++) {
      const s = pickRandom(activeStaffPool);
      const status: "approved" | "pending" | "rejected" = i < 14 ? "approved" : i < 17 ? "pending" : "rejected";
      const startDate = addDays(now, -randInt(5, 60));
      const length = randInt(1, 3);
      const endDate = addDays(startDate, length - 1);
      const leaveTypeName = pickWeighted<string>([["Casual Leave", 3], ["Sick Leave", 2], ["Other", 1]]);
      leavePlan.push({
        staff: s,
        leaveTypeName,
        startDate,
        endDate,
        status,
        reason: pickRandom(["Family function", "Not feeling well", "Personal work", "Travel", "Festival"]),
      });
      if (status === "approved") {
        for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
          leaveOverrides.set(`${s.id}:${isoDate(d)}`, "leave");
        }
      }
    }

    // ---- Phase 7: attendance (bulk) --------------------------------------

    const attStart = addDays(now, -ATTENDANCE_WINDOW_DAYS);
    const attEnd = addDays(now, -1);

    const attendanceRows: unknown[][] = [];
    const staffAttendanceRows: unknown[][] = [];

    for (const branch of branches) {
      const holidaysByIso = holidaysByBranchIso.get(branch.id) ?? new Map<string, DayType>();
      const dayTypes = computeDayTypes(attStart, attEnd, session.startDate, session.endDate, [0], [6], holidaysByIso);

      const branchStudents = enrolledStudents.filter((s) => s.branchId === branch.id);
      for (const [iso, dayType] of dayTypes) {
        if (dayType === "holiday") continue;
        const date = new Date(iso);
        for (const student of branchStudents) {
          const status = pickWeighted<string>([["present", 85], ["absent", 8], ["late", 4], ["half_day", 2], ["leave", 1]]);
          attendanceRows.push([
            randomUUID(), DEMO_TENANT_ID, branch.id, student.id, student.classId, student.sectionId, date, status,
            adminPersonaUserId, now,
          ]);
        }
      }

      const branchStaff = staff.filter((s) => s.branchId === branch.id && s.status !== "relieved");
      for (const [iso, dayType] of dayTypes) {
        if (dayType === "holiday") continue;
        const date = new Date(iso);
        for (const s of branchStaff) {
          if (s.dateOfJoining > date) continue;
          const override = leaveOverrides.get(`${s.id}:${iso}`);
          const status = override ?? pickWeighted<string>([["present", 85], ["absent", 5], ["half_day", 3], ["leave", 4], ["leave_unpaid", 3]]);
          staffAttendanceRows.push([randomUUID(), DEMO_TENANT_ID, branch.id, s.id, date, status, adminPersonaUserId, now]);
        }
      }
    }

    await batchInsert(
      client,
      "attendance_records",
      ["id", "tenant_id", "branch_id", "student_id", "class_id", "section_id", "attendance_date", "status", "marked_by", "updated_at"],
      attendanceRows,
    );
    await batchInsert(
      client,
      "staff_attendance",
      ["id", "tenant_id", "branch_id", "staff_id", "attendance_date", "status", "marked_by", "updated_at"],
      staffAttendanceRows,
    );

    // Lookup used by the payroll phase below -- built once rather than
    // re-scanning staffAttendanceRows per staff member per pay period.
    const staffAttendanceByKey = new Map<string, string>();
    for (const row of staffAttendanceRows) {
      staffAttendanceByKey.set(`${row[3]}:${isoDate(row[4] as Date)}`, row[5] as string);
    }

    // ---- Phase 8: timetable / period slots --------------------------------

    const periodSlotsByBranch = new Map<string, { id: string; type: string; sortOrder: number }[]>();
    const periodSlotRows: unknown[][] = [];
    for (const branch of branches) {
      const list: { id: string; type: string; sortOrder: number }[] = [];
      PERIOD_SLOT_DEFS.forEach((def, idx) => {
        const id = randomUUID();
        list.push({ id, type: def.type, sortOrder: idx });
        periodSlotRows.push([id, DEMO_TENANT_ID, branch.id, sessionId, def.name, idx, def.start, def.end, def.type, now]);
      });
      periodSlotsByBranch.set(branch.id, list);
    }
    await batchInsert(
      client,
      "period_slots",
      ["id", "tenant_id", "branch_id", "academic_session_id", "name", "sort_order", "start_time", "end_time", "period_type", "updated_at"],
      periodSlotRows,
    );

    const timetableRows: unknown[][] = [];
    for (const section of sections) {
      const cls = classes.find((c) => c.id === section.classId);
      if (!cls) continue;
      const branchSubjects = subjects.filter((s) => s.branchId === cls.branchId);
      if (branchSubjects.length === 0) continue;
      const teachingSlots = (periodSlotsByBranch.get(cls.branchId) ?? []).filter((p) => p.type === "teaching");

      for (let dow = 1; dow <= 5; dow++) {
        teachingSlots.forEach((slot, periodIdx) => {
          const subject = branchSubjects[(dow * teachingSlots.length + periodIdx) % branchSubjects.length];
          const teacher = teacherByClassSubject.get(`${cls.id}:${subject.id}`);
          if (!teacher) return;
          timetableRows.push([
            randomUUID(), DEMO_TENANT_ID, cls.branchId, sessionId, cls.id, section.id, dow, slot.id, subject.id, teacher.id,
            `Room ${100 + cls.sortOrder * 10 + (section.name === "A" ? 1 : 2)}`, now,
          ]);
        });
      }
    }
    await batchInsert(
      client,
      "timetable_entries",
      ["id", "tenant_id", "branch_id", "academic_session_id", "class_id", "section_id", "day_of_week", "period_slot_id", "subject_id", "staff_id", "room_name", "updated_at"],
      timetableRows,
    );

    // ---- Phase 9: exams / exam_marks --------------------------------------

    interface ExamInfo {
      id: string;
      classId: string;
      published: boolean;
      passingPercentage: number;
    }
    const exams: ExamInfo[] = [];
    const examRows: unknown[][] = [];
    for (const cls of classes) {
      const midTermId = randomUUID();
      exams.push({ id: midTermId, classId: cls.id, published: true, passingPercentage: 33.0 });
      examRows.push([
        midTermId, DEMO_TENANT_ID, cls.branchId, sessionId, cls.id, "Mid-Term Examination", addDays(now, -35),
        "regular", 33.0, addDays(now, -20), now,
      ]);

      const unitTest2Id = randomUUID();
      exams.push({ id: unitTest2Id, classId: cls.id, published: false, passingPercentage: 33.0 });
      examRows.push([
        unitTest2Id, DEMO_TENANT_ID, cls.branchId, sessionId, cls.id, "Unit Test 2", addDays(now, 10),
        "regular", 33.0, null, now,
      ]);
    }
    await batchInsert(
      client,
      "exams",
      ["id", "tenant_id", "branch_id", "academic_session_id", "class_id", "name", "exam_date", "exam_type", "passing_percentage", "results_published_at", "updated_at"],
      examRows,
    );

    const examMarkRows: unknown[][] = [];
    for (const exam of exams) {
      if (!exam.published) continue;
      const classStudents = enrolledStudents.filter((s) => s.classId === exam.classId);
      const classSubjects = subjects.filter((s) => classes.find((c) => c.id === exam.classId)?.branchId === s.branchId);
      for (const student of classStudents) {
        for (const subject of classSubjects) {
          const maxMarks = 100;
          const isAbsent = Math.random() < 0.04;
          const marksObtained = isAbsent ? null : Math.round((maxMarks * randInt(30, 96)) / 100);
          let result: string | null;
          if (isAbsent) result = "fail";
          else if (marksObtained === null) result = null;
          else result = (marksObtained / maxMarks) * 100 >= exam.passingPercentage ? "pass" : "fail";

          examMarkRows.push([
            randomUUID(), DEMO_TENANT_ID, exam.id, subject.id, student.id, maxMarks, marksObtained, isAbsent, result, now,
          ]);
        }
      }
    }
    await batchInsert(
      client,
      "exam_marks",
      ["id", "tenant_id", "exam_id", "subject_id", "student_id", "max_marks", "marks_obtained", "is_absent", "result", "updated_at"],
      examMarkRows,
    );

    // ---- Phase 10: fees ----------------------------------------------------

    interface FeeStructureInfo {
      id: string;
      branchId: string;
      classId: string | null;
      frequency: string;
      feeType: string;
      amount: number;
    }
    const feeStructures: FeeStructureInfo[] = [];
    const feeStructureRows: unknown[][] = [];
    for (const cls of classes) {
      const id = randomUUID();
      const amount = rupeesToPaise(1500 + cls.sortOrder * 150 + (branches.findIndex((b) => b.id === cls.branchId) === 1 ? 200 : 0));
      feeStructures.push({ id, branchId: cls.branchId, classId: cls.id, frequency: "monthly", feeType: "tuition", amount });
      feeStructureRows.push([id, DEMO_TENANT_ID, cls.branchId, sessionId, cls.id, `${cls.name} Tuition Fee`, amount, "monthly", "tuition", now]);
    }
    for (const branch of branches) {
      const transportId = randomUUID();
      const transportAmount = rupeesToPaise(1000);
      feeStructures.push({ id: transportId, branchId: branch.id, classId: null, frequency: "monthly", feeType: "transport", amount: transportAmount });
      feeStructureRows.push([transportId, DEMO_TENANT_ID, branch.id, sessionId, null, "Transport Fee", transportAmount, "monthly", "transport", now]);

      const libraryId = randomUUID();
      const libraryAmount = rupeesToPaise(500);
      feeStructures.push({ id: libraryId, branchId: branch.id, classId: null, frequency: "annual", feeType: "library", amount: libraryAmount });
      feeStructureRows.push([libraryId, DEMO_TENANT_ID, branch.id, sessionId, null, "Annual Library Fee", libraryAmount, "annual", "library", now]);

      const examFeeId = randomUUID();
      const examFeeAmount = rupeesToPaise(1000);
      feeStructures.push({ id: examFeeId, branchId: branch.id, classId: null, frequency: "one_time", feeType: "exam", amount: examFeeAmount });
      feeStructureRows.push([examFeeId, DEMO_TENANT_ID, branch.id, sessionId, null, "Examination Fee", examFeeAmount, "one_time", "exam", now]);
    }
    await batchInsert(
      client,
      "fee_structures",
      ["id", "tenant_id", "branch_id", "academic_session_id", "class_id", "name", "amount", "frequency", "fee_type", "updated_at"],
      feeStructureRows,
    );

    // Replicates FeesService.periodsFor's monthly branch exactly: every
    // month from session start through the current month, capped at
    // session end.
    function monthlyPeriods(): { label: string; dueDate: Date }[] {
      const sessionStartMonth = new Date(Date.UTC(session.startDate.getUTCFullYear(), session.startDate.getUTCMonth(), 1));
      const sessionEndMonth = new Date(Date.UTC(session.endDate.getUTCFullYear(), session.endDate.getUTCMonth(), 1));
      let cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      if (cutoff > sessionEndMonth) cutoff = sessionEndMonth;
      const periods: { label: string; dueDate: Date }[] = [];
      for (let d = sessionStartMonth; d <= cutoff; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
        periods.push({ label: d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }), dueDate: d });
      }
      return periods;
    }

    function pickInvoiceStatus(daysAgo: number): "paid" | "partial" | "pending" {
      if (daysAgo > 60) return pickWeighted<"paid" | "partial" | "pending">([["paid", 80], ["partial", 15], ["pending", 5]]);
      if (daysAgo >= 30) return pickWeighted<"paid" | "partial" | "pending">([["paid", 55], ["partial", 25], ["pending", 20]]);
      return pickWeighted<"paid" | "partial" | "pending">([["paid", 30], ["partial", 20], ["pending", 50]]);
    }

    const feeInvoiceRows: unknown[][] = [];
    const feePaymentRows: unknown[][] = [];
    const paymentMethods: [string, number][] = [["cash", 3], ["upi", 3], ["online", 2], ["bank_transfer", 1], ["cheque", 1], ["card", 1]];

    function addInvoice(
      structure: FeeStructureInfo,
      studentId: string,
      branchId: string,
      periodLabel: string,
      dueDate: Date | null,
    ) {
      const invoiceId = randomUUID();
      const amountDue = structure.amount;
      const asOfDate = dueDate ?? now;
      const daysAgo = Math.floor((now.getTime() - asOfDate.getTime()) / (24 * 60 * 60 * 1000));
      const status = pickInvoiceStatus(daysAgo);
      let amountPaid = 0;
      if (status === "paid") amountPaid = amountDue;
      else if (status === "partial") amountPaid = Math.max(1, Math.round(amountDue * (randInt(30, 70) / 100)));

      feeInvoiceRows.push([
        invoiceId, DEMO_TENANT_ID, branchId, studentId, structure.id, sessionId, periodLabel, structure.amount, 0,
        amountDue, amountPaid, dueDate, status, now,
      ]);

      if (amountPaid > 0) {
        const branchCode = branches.find((b) => b.id === branchId)?.code ?? "MAIN";
        const paymentDate = randomDateBetween(asOfDate, now);
        const receiptNumber = `RCPT-${branchCode.slice(0, 4).toUpperCase()}-${isoDate(paymentDate).replace(/-/g, "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
        feePaymentRows.push([
          randomUUID(), DEMO_TENANT_ID, invoiceId, amountPaid, pickWeighted<string>(paymentMethods), paymentDate,
          receiptNumber, adminPersonaUserId, now,
        ]);
      }
    }

    const tuitionStructureByClass = new Map<string, FeeStructureInfo>();
    for (const fs of feeStructures) {
      if (fs.feeType === "tuition" && fs.classId) tuitionStructureByClass.set(fs.classId, fs);
    }
    const transportStructureByBranch = new Map<string, FeeStructureInfo>();
    const libraryStructureByBranch = new Map<string, FeeStructureInfo>();
    const examStructureByBranch = new Map<string, FeeStructureInfo>();
    for (const fs of feeStructures) {
      if (fs.feeType === "transport") transportStructureByBranch.set(fs.branchId, fs);
      if (fs.feeType === "library") libraryStructureByBranch.set(fs.branchId, fs);
      if (fs.feeType === "exam") examStructureByBranch.set(fs.branchId, fs);
    }

    const monthly = monthlyPeriods();
    for (const student of enrolledStudents) {
      if (!student.classId) continue;
      const tuition = tuitionStructureByClass.get(student.classId);
      if (tuition) {
        for (const period of monthly) {
          addInvoice(tuition, student.id, student.branchId, period.label, period.dueDate);
        }
      }
      if (transportRiderIds.has(student.id)) {
        const transportFee = transportStructureByBranch.get(student.branchId);
        if (transportFee) {
          for (const period of monthly) {
            addInvoice(transportFee, student.id, student.branchId, period.label, period.dueDate);
          }
        }
      }
      const libraryFee = libraryStructureByBranch.get(student.branchId);
      if (libraryFee) addInvoice(libraryFee, student.id, student.branchId, "", null);
      const examFee = examStructureByBranch.get(student.branchId);
      if (examFee) addInvoice(examFee, student.id, student.branchId, "", null);
    }

    await batchInsert(
      client,
      "fee_invoices",
      ["id", "tenant_id", "branch_id", "student_id", "fee_structure_id", "academic_session_id", "period_label", "gross_amount", "discount_amount", "amount_due", "amount_paid", "due_date", "status", "updated_at"],
      feeInvoiceRows,
    );
    await batchInsert(
      client,
      "fee_payments",
      ["id", "tenant_id", "invoice_id", "amount", "payment_method", "payment_date", "receipt_number", "recorded_by", "updated_at"],
      feePaymentRows,
    );

    // ---- Phase 11: payroll ---------------------------------------------

    interface SalaryStructureInfo {
      id: string;
      staffId: string;
      basicAmount: number;
      effectiveFrom: Date;
    }
    const salaryStructures: SalaryStructureInfo[] = [];
    const salaryStructureRows: unknown[][] = [];
    const salaryComponentRows: unknown[][] = [];
    for (const s of staff) {
      const band = DESIGNATION_SALARY_BAND[s.designation] ?? [20000, 28000];
      const basicAmount = rupeesToPaise(randInt(band[0], band[1]));
      const structureId = randomUUID();
      salaryStructures.push({ id: structureId, staffId: s.id, basicAmount, effectiveFrom: s.dateOfJoining });
      salaryStructureRows.push([structureId, DEMO_TENANT_ID, s.branchId, s.id, s.dateOfJoining, basicAmount, now]);

      salaryComponentRows.push([randomUUID(), DEMO_TENANT_ID, structureId, "HRA", "earning", "percent_of_basic", null, 20, now]);
      salaryComponentRows.push([randomUUID(), DEMO_TENANT_ID, structureId, "DA", "earning", "percent_of_basic", null, 10, now]);
      salaryComponentRows.push([randomUUID(), DEMO_TENANT_ID, structureId, "Provident Fund", "deduction", "percent_of_basic", null, 12, now]);
    }
    await batchInsert(
      client,
      "salary_structures",
      ["id", "tenant_id", "branch_id", "staff_id", "effective_from", "basic_amount", "updated_at"],
      salaryStructureRows,
    );
    await batchInsert(
      client,
      "salary_components",
      ["id", "tenant_id", "salary_structure_id", "component_name", "component_type", "calculation_type", "amount", "percent", "updated_at"],
      salaryComponentRows,
    );

    function componentAmount(basicAmount: number, calcType: string, amount: number | null, percent: number | null): number {
      if (calcType === "percent_of_basic") return Math.round((basicAmount * (percent ?? 0)) / 100);
      return amount ?? 0;
    }

    const payrollRunRows: unknown[][] = [];
    const payslipRows: unknown[][] = [];
    const payslipLineItemRows: unknown[][] = [];

    // Last PAYROLL_MONTHS calendar months, oldest first.
    const payrollMonths: { year: number; month: number }[] = [];
    for (let i = PAYROLL_MONTHS - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      payrollMonths.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
    }

    for (const branch of branches) {
      const holidaysByIso = holidaysByBranchIso.get(branch.id) ?? new Map<string, DayType>();

      payrollMonths.forEach((period, periodIdx) => {
        const periodStart = new Date(Date.UTC(period.year, period.month - 1, 1));
        const periodEnd = period.month === 12 ? new Date(Date.UTC(period.year + 1, 0, 1)) : new Date(Date.UTC(period.year, period.month, 1));
        const periodLastDay = addDays(periodEnd, -1);

        const dayTypes = computeDayTypes(periodStart, periodLastDay, session.startDate, session.endDate, [0], [6], holidaysByIso);
        const workingDaysInPeriod = [...dayTypes.values()].reduce((sum, t) => sum + dayWeight(t), 0);

        const runId = randomUUID();
        const isLatestRun = periodIdx === payrollMonths.length - 1;
        const runStatus = isLatestRun ? "draft" : "finalized";
        payrollRunRows.push([runId, DEMO_TENANT_ID, branch.id, period.month, period.year, runStatus, now, adminPersonaUserId, now]);

        const branchStaff = staff.filter((s) => s.branchId === branch.id && s.status === "active" && s.dateOfJoining <= periodLastDay);
        for (const s of branchStaff) {
          const structure = salaryStructures.find((st) => st.staffId === s.id);
          if (!structure) continue;

          let daysPresent = 0;
          let daysLop = 0;
          for (const [iso, dayType] of dayTypes) {
            if (dayType === "holiday") continue;
            const status = staffAttendanceByKey.get(`${s.id}:${iso}`);
            if (!status) continue;
            if (status === "present") daysPresent += 1;
            else if (status === "absent") daysLop += 1;
            else if (status === "half_day") {
              daysPresent += 0.5;
              daysLop += 0.5;
            } else if (status === "leave_unpaid") daysLop += 1;
          }

          const earningComponents = salaryComponentRows
            .filter((r) => r[2] === structure.id && r[4] === "earning")
            .reduce((sum, r) => sum + componentAmount(structure.basicAmount, r[5] as string, r[6] as number | null, r[7] as number | null), 0);
          const deductionComponents = salaryComponentRows
            .filter((r) => r[2] === structure.id && r[4] === "deduction")
            .reduce((sum, r) => sum + componentAmount(structure.basicAmount, r[5] as string, r[6] as number | null, r[7] as number | null), 0);

          const grossBeforeLop = structure.basicAmount + earningComponents;
          const lopAmount = workingDaysInPeriod > 0 ? Math.round((grossBeforeLop / workingDaysInPeriod) * daysLop) : 0;
          const grossEarnings = Math.max(grossBeforeLop - lopAmount, 0);
          const netPay = Math.max(grossEarnings - deductionComponents, 0);

          const payslipId = randomUUID();
          const isPaid = runStatus === "finalized" && Math.random() < 0.7;
          payslipRows.push([
            payslipId, DEMO_TENANT_ID, runId, s.id, workingDaysInPeriod, daysPresent, daysLop, grossEarnings,
            deductionComponents, netPay, isPaid ? "paid" : runStatus === "finalized" ? "finalized" : "draft",
            isPaid ? addDays(periodLastDay, randInt(1, 5)) : null, now,
          ]);

          payslipLineItemRows.push([randomUUID(), DEMO_TENANT_ID, payslipId, "Basic", "earning", structure.basicAmount, now]);
          for (const r of salaryComponentRows.filter((c) => c[2] === structure.id && c[4] === "earning")) {
            payslipLineItemRows.push([
              randomUUID(), DEMO_TENANT_ID, payslipId, r[3], "earning",
              componentAmount(structure.basicAmount, r[5] as string, r[6] as number | null, r[7] as number | null), now,
            ]);
          }
          if (lopAmount > 0) {
            payslipLineItemRows.push([randomUUID(), DEMO_TENANT_ID, payslipId, "Loss of Pay", "deduction", lopAmount, now]);
          }
          for (const r of salaryComponentRows.filter((c) => c[2] === structure.id && c[4] === "deduction")) {
            payslipLineItemRows.push([
              randomUUID(), DEMO_TENANT_ID, payslipId, r[3], "deduction",
              componentAmount(structure.basicAmount, r[5] as string, r[6] as number | null, r[7] as number | null), now,
            ]);
          }
        }
      });
    }

    await batchInsert(
      client,
      "payroll_runs",
      ["id", "tenant_id", "branch_id", "period_month", "period_year", "status", "generated_at", "generated_by", "updated_at"],
      payrollRunRows,
    );
    await batchInsert(
      client,
      "payslips",
      ["id", "tenant_id", "payroll_run_id", "staff_id", "days_in_month", "days_present", "days_lop", "gross_earnings", "total_deductions", "net_pay", "status", "paid_on", "updated_at"],
      payslipRows,
    );
    await batchInsert(
      client,
      "payslip_line_items",
      ["id", "tenant_id", "payslip_id", "component_name", "component_type", "amount", "updated_at"],
      payslipLineItemRows,
    );

    // ---- Phase 12: expenses / leave requests ------------------------------

    const expenseCategoryBands: { name: string; weight: number; min: number; max: number }[] = [
      { name: "Utilities", weight: 4, min: 2000, max: 15000 },
      { name: "Maintenance", weight: 3, min: 1000, max: 25000 },
      { name: "Stationery", weight: 4, min: 500, max: 5000 },
      { name: "Transport & Fuel", weight: 2, min: 3000, max: 20000 },
      { name: "Miscellaneous", weight: 2, min: 500, max: 10000 },
    ];
    const vendorNames = ["Sharma Stationers", "City Electric Works", "Metro Facility Services", "Fuel Point", "Om Traders", "Bright Supplies Co.", "Delhi Maintenance Services"];
    const accountantUserId = personaUserIds.get("accountant@demo.managevidya.in") ?? adminPersonaUserId;
    const frontdeskUserId = personaUserIds.get("frontdesk@demo.managevidya.in") ?? adminPersonaUserId;

    const expenseRows: unknown[][] = [];
    for (let i = 0; i < EXPENSE_COUNT; i++) {
      const branch = branches[i % BRANCH_COUNT];
      const band = pickWeighted(expenseCategoryBands.map((b) => [b, b.weight] as [typeof b, number]));
      const amount = rupeesToPaise(randInt(band.min, band.max));
      const expenseDate = addDays(now, -randInt(1, 120));
      expenseRows.push([
        randomUUID(), DEMO_TENANT_ID, branch.id, masterDataIds.get(`expense_category:${band.name}`) ?? null,
        `${band.name} - ${pickRandom(["monthly", "quarterly", "one-off"])} expense`, amount, expenseDate,
        pickRandom(["cash", "upi", "bank_transfer", "cheque"]), pickRandom(vendorNames),
        Math.random() < 0.5 ? accountantUserId : frontdeskUserId, expenseDate, now,
      ]);
    }
    await batchInsert(
      client,
      "expenses",
      ["id", "tenant_id", "branch_id", "category_id", "description", "amount", "expense_date", "payment_mode", "vendor_name", "recorded_by_user_id", "created_at", "updated_at"],
      expenseRows,
    );

    const leaveRequestRows: unknown[][] = leavePlan.map((item) => {
      const dayCount = Math.round((item.endDate.getTime() - item.startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      const leaveType = leaveTypeIds.get(item.leaveTypeName) ?? null;
      const isApproved = item.status === "approved";
      return [
        randomUUID(), DEMO_TENANT_ID, item.staff.branchId, item.staff.id, item.startDate, item.endDate, item.reason,
        item.status, adminPersonaUserId, isApproved ? adminPersonaUserId : null, isApproved ? addDays(item.startDate, -1) : null,
        false, leaveType, isApproved ? dayCount : null, isApproved ? 0 : null, now, now,
      ];
    });
    await batchInsert(
      client,
      "staff_leave_requests",
      ["id", "tenant_id", "branch_id", "staff_id", "start_date", "end_date", "reason", "status", "requested_by_user_id", "decided_by_user_id", "decided_at", "is_half_day", "leave_type_id", "paid_days", "unpaid_days", "created_at", "updated_at"],
      leaveRequestRows,
    );

    // ---- Phase 13: library --------------------------------------------

    const BOOK_CATALOG: { title: string; author: string }[] = [
      { title: "Panchatantra Tales", author: "Vishnu Sharma" },
      { title: "The Jungle Book", author: "Rudyard Kipling" },
      { title: "Malgudi Days", author: "R.K. Narayan" },
      { title: "A Wrinkle in Time", author: "Madeleine L'Engle" },
      { title: "Charlotte's Web", author: "E.B. White" },
      { title: "Matilda", author: "Roald Dahl" },
      { title: "The Discovery of India", author: "Jawaharlal Nehru" },
      { title: "Wings of Fire", author: "A.P.J. Abdul Kalam" },
      { title: "Five Point Someone", author: "Chetan Bhagat" },
      { title: "The Story of My Experiments with Truth", author: "M.K. Gandhi" },
      { title: "Physics for Class Students", author: "H.C. Verma" },
      { title: "NCERT Mathematics", author: "NCERT" },
      { title: "A Brief History of Time", author: "Stephen Hawking" },
      { title: "Encyclopedia of Science", author: "DK Publishing" },
      { title: "Atlas of the World", author: "National Geographic" },
      { title: "Tales of Panchatantra II", author: "Vishnu Sharma" },
      { title: "Harry Potter and the Philosopher's Stone", author: "J.K. Rowling" },
      { title: "The Hobbit", author: "J.R.R. Tolkien" },
      { title: "Alice's Adventures in Wonderland", author: "Lewis Carroll" },
      { title: "Grammar in Use", author: "Raymond Murphy" },
      { title: "Indian History for Schools", author: "Bipan Chandra" },
      { title: "Amar Chitra Katha: Ramayana", author: "Anant Pai" },
      { title: "Amar Chitra Katha: Mahabharata", author: "Anant Pai" },
      { title: "The Adventures of Tintin", author: "Herge" },
      { title: "Chemistry Made Simple", author: "R.P. Verma" },
      { title: "Biology for Beginners", author: "S.K. Rao" },
      { title: "Panchatantra in English", author: "Vishnu Sharma" },
      { title: "The Little Prince", author: "Antoine de Saint-Exupery" },
      { title: "Around the World in Eighty Days", author: "Jules Verne" },
      { title: "The Adventures of Sherlock Holmes", author: "Arthur Conan Doyle" },
      { title: "Robinson Crusoe", author: "Daniel Defoe" },
      { title: "Gulliver's Travels", author: "Jonathan Swift" },
      { title: "Panchatantra: Wisdom Tales", author: "Vishnu Sharma" },
      { title: "The Wonderful Wizard of Oz", author: "L. Frank Baum" },
      { title: "Anne of Green Gables", author: "L.M. Montgomery" },
      { title: "Introduction to Computer Science", author: "V. Rajaraman" },
      { title: "Environmental Studies", author: "NCERT" },
      { title: "General Knowledge 2026", author: "Arihant Publications" },
      { title: "Panchatantra: Animal Fables", author: "Vishnu Sharma" },
      { title: "Moral Stories for Children", author: "Various" },
      { title: "The Secret Garden", author: "Frances Hodgson Burnett" },
      { title: "Black Beauty", author: "Anna Sewell" },
      { title: "Treasure Island", author: "Robert Louis Stevenson" },
      { title: "Heidi", author: "Johanna Spyri" },
      { title: "Little Women", author: "Louisa May Alcott" },
    ];
    const BOOK_CATEGORIES = ["Fiction", "Non-Fiction", "Reference", "Science", "Mathematics", "Biography"];

    // Plan issues in memory first so available_copies can be computed
    // directly at book-insert time rather than via a post-hoc UPDATE.
    const libraryBooks: { id: string; branchId: string; totalCopies: number }[] = [];
    for (let i = 0; i < LIBRARY_BOOK_COUNT; i++) {
      const branch = branches[i % BRANCH_COUNT];
      libraryBooks.push({ id: randomUUID(), branchId: branch.id, totalCopies: randInt(1, 5) });
    }

    const issuedOpenCountByBook = new Map<string, number>();
    const libraryIssueRows: unknown[][] = [];
    const issueCount = 90;
    for (let i = 0; i < issueCount; i++) {
      const bucket = pickWeighted<"returned" | "current" | "overdue">([["returned", 60], ["current", 30], ["overdue", 10]]);
      const isOpenIssue = bucket !== "returned";

      // A "current"/"overdue" issue holds a copy -- never assign more open
      // issues to a book than it has total_copies, or available_copies
      // would have to go negative (clamped to 0 below, which would then
      // disagree with the actual open-issue count).
      const candidateBooks = isOpenIssue
        ? libraryBooks.filter((b) => (issuedOpenCountByBook.get(b.id) ?? 0) < b.totalCopies)
        : libraryBooks;
      if (candidateBooks.length === 0) continue;
      const book = pickRandom(candidateBooks);

      const branchStudents = enrolledStudents.filter((s) => s.branchId === book.branchId);
      if (branchStudents.length === 0) continue;
      const student = pickRandom(branchStudents);

      let issuedDate: Date;
      let dueDate: Date;
      let returnedDate: Date | null;
      let status: string;
      if (bucket === "returned") {
        issuedDate = addDays(now, -randInt(20, 80));
        dueDate = addDays(issuedDate, 14);
        returnedDate = addDays(issuedDate, randInt(3, 13));
        status = "returned";
      } else if (bucket === "current") {
        issuedDate = addDays(now, -randInt(1, 10));
        dueDate = addDays(now, randInt(1, 10));
        returnedDate = null;
        status = "issued";
        issuedOpenCountByBook.set(book.id, (issuedOpenCountByBook.get(book.id) ?? 0) + 1);
      } else {
        issuedDate = addDays(now, -randInt(20, 40));
        dueDate = addDays(now, -randInt(1, 15));
        returnedDate = null;
        status = "issued";
        issuedOpenCountByBook.set(book.id, (issuedOpenCountByBook.get(book.id) ?? 0) + 1);
      }

      libraryIssueRows.push([
        randomUUID(), DEMO_TENANT_ID, book.branchId, book.id, student.id, issuedDate, dueDate, returnedDate, status,
        frontdeskUserId, now,
      ]);
    }

    const libraryBookRows: unknown[][] = libraryBooks.map((b) => {
      const issued = issuedOpenCountByBook.get(b.id) ?? 0;
      const pair = pickRandom(BOOK_CATALOG);
      return [
        b.id, DEMO_TENANT_ID, b.branchId, pair.title, pair.author,
        `978${randInt(1000000000, 1999999999)}`, pickRandom(BOOK_CATEGORIES), b.totalCopies,
        Math.max(b.totalCopies - issued, 0), now,
      ];
    });
    await batchInsert(
      client,
      "library_books",
      ["id", "tenant_id", "branch_id", "title", "author", "isbn", "category", "total_copies", "available_copies", "updated_at"],
      libraryBookRows,
    );
    await batchInsert(
      client,
      "library_issues",
      ["id", "tenant_id", "branch_id", "book_id", "student_id", "issued_date", "due_date", "returned_date", "status", "issued_by", "updated_at"],
      libraryIssueRows,
    );

    // ---- Phase 14: transport --------------------------------------------

    const AREA_NAMES = ["Sector 12", "City Center", "Green Park", "Civil Lines", "Model Town", "Lajpat Nagar"];
    const transportRoutes: { id: string; branchId: string }[] = [];
    const transportRouteRows: unknown[][] = [];
    const transportStopsByRoute = new Map<string, { id: string }[]>();
    const transportStopRows: unknown[][] = [];

    for (let i = 0; i < 6; i++) {
      const branch = branches[i % BRANCH_COUNT];
      const driver = drivers[i] ?? drivers[i % Math.max(drivers.length, 1)];
      const routeId = randomUUID();
      transportRoutes.push({ id: routeId, branchId: branch.id });
      transportRouteRows.push([
        routeId, DEMO_TENANT_ID, branch.id, `Route ${i + 1} - ${AREA_NAMES[i % AREA_NAMES.length]}`,
        `DL-0${randInt(1, 9)}-${String.fromCharCode(65 + randInt(0, 25))}${String.fromCharCode(65 + randInt(0, 25))}-${randInt(1000, 9999)}`,
        driver ? driver.name : null, driver ? driver.phone : null, randInt(30, 50), now,
      ]);

      const stops: { id: string }[] = [];
      const stopCount = randInt(3, 5);
      for (let s = 0; s < stopCount; s++) {
        const stopId = randomUUID();
        stops.push({ id: stopId });
        const hour = 7;
        const minute = String(s * 10).padStart(2, "0");
        transportStopRows.push([stopId, DEMO_TENANT_ID, routeId, `${AREA_NAMES[(i + s) % AREA_NAMES.length]} Stop ${s + 1}`, s, `${hour}:${minute}`, now]);
      }
      transportStopsByRoute.set(routeId, stops);
    }
    await batchInsert(
      client,
      "transport_routes",
      ["id", "tenant_id", "branch_id", "name", "vehicle_number", "driver_name", "driver_phone", "capacity", "updated_at"],
      transportRouteRows,
    );
    await batchInsert(
      client,
      "transport_stops",
      ["id", "tenant_id", "route_id", "name", "sequence", "pickup_time", "updated_at"],
      transportStopRows,
    );

    const studentTransportRows: unknown[][] = [];
    let routeCursor = 0;
    for (const student of enrolledStudents) {
      if (!transportRiderIds.has(student.id)) continue;
      const branchRoutes = transportRoutes.filter((r) => r.branchId === student.branchId);
      if (branchRoutes.length === 0) continue;
      const route = branchRoutes[routeCursor % branchRoutes.length];
      routeCursor++;
      const stops = transportStopsByRoute.get(route.id) ?? [];
      if (stops.length === 0) continue;
      const stop = pickRandom(stops);
      studentTransportRows.push([randomUUID(), DEMO_TENANT_ID, student.id, route.id, stop.id, now]);
    }
    await batchInsert(
      client,
      "student_transport",
      ["id", "tenant_id", "student_id", "route_id", "stop_id", "updated_at"],
      studentTransportRows,
    );

    await client.query("COMMIT");

    console.log("Seeded demo tenant:", DEMO_TENANT_ID);
    console.log("  Subdomain:  ", DEMO_SUBDOMAIN, "(expects https://demo.managevidya.in once DNS is configured)");
    console.log("  School:     ", DEMO_SCHOOL_NAME);
    console.log("  Students:   ", students.length, `(${enrolledStudents.length} enrolled)`);
    console.log("  Staff:      ", staff.length);
    console.log("Persona logins (all use the same password):");
    console.log("  Password:   ", DEMO_PASSWORD);
    for (const persona of PERSONA_DEFS) {
      console.log(`  ${persona.roleName.padEnd(13)}`, persona.email);
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
