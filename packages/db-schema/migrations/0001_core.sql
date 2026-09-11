-- 0001_core.sql
-- Core schema shared conceptually between local SQLite (desktop) and Postgres (cloud-api).
-- Kept intentionally portable: no dialect-specific features in these tables.
-- Every syncable table carries: id (UUID), tenant_id, branch_id, updated_at, updated_by,
-- deleted_at (soft delete), version (bumped on every write, used for sync conflict detection).

-- ============================================================================
-- Tenancy
-- ============================================================================

CREATE TABLE tenants (
  id              TEXT PRIMARY KEY,          -- UUID
  name            TEXT NOT NULL,
  subdomain       TEXT UNIQUE,
  subscription_status TEXT NOT NULL DEFAULT 'trial', -- trial | active | past_due | cancelled
  subscription_expires_at TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE branches (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,             -- short branch code, e.g. "MAIN", "NORTH"
  address         TEXT,
  city            TEXT,
  state           TEXT,
  pincode         TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, code)
);

-- ============================================================================
-- Users, roles, RBAC (mirrored locally so permission checks work offline)
-- ============================================================================

CREATE TABLE roles (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,             -- super_admin | branch_admin | accountant | teacher | front_desk
  updated_at      TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, name)
);

CREATE TABLE users (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT REFERENCES branches(id), -- NULL = access to all branches (e.g. super_admin)
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  password_hash   TEXT,                      -- set/verified server-side only; desktop never stores plaintext
  is_active       INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, email)
);

CREATE TABLE user_roles (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  role_id         TEXT NOT NULL REFERENCES roles(id),
  updated_at      TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (user_id, role_id)
);

-- ============================================================================
-- Academic structure
-- ============================================================================

CREATE TABLE academic_sessions (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,             -- e.g. "2026-2027"
  start_date      TEXT NOT NULL,
  end_date        TEXT NOT NULL,
  is_current      INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE classes (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id),
  name            TEXT NOT NULL,             -- e.g. "Class 8", "Grade 10", "B.Com 2nd Year"
  sort_order      INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sections (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  class_id        TEXT NOT NULL REFERENCES classes(id),
  name            TEXT NOT NULL,             -- e.g. "A", "B"
  class_teacher_id TEXT REFERENCES users(id),
  capacity        INTEGER,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

-- ============================================================================
-- Students, guardians, admissions
-- ============================================================================

CREATE TABLE students (
  id              TEXT PRIMARY KEY,          -- UUID, client-generated
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  admission_number TEXT,                     -- assigned on enrollment, unique per tenant
  first_name      TEXT NOT NULL,
  last_name       TEXT,
  date_of_birth   TEXT,
  gender          TEXT,
  blood_group     TEXT,
  photo_path      TEXT,                      -- local path or cloud URL
  current_class_id TEXT REFERENCES classes(id),
  current_section_id TEXT REFERENCES sections(id),
  status          TEXT NOT NULL DEFAULT 'enquiry', -- enquiry | applied | enrolled | alumni | withdrawn
  address         TEXT,
  city            TEXT,
  state           TEXT,
  pincode         TEXT,
  notes           TEXT,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, admission_number)
);

CREATE TABLE guardians (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  full_name       TEXT NOT NULL,
  relation        TEXT,                      -- father | mother | guardian
  phone           TEXT,
  alt_phone       TEXT,
  email           TEXT,
  occupation      TEXT,
  address         TEXT,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE student_guardians (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  guardian_id     TEXT NOT NULL REFERENCES guardians(id),
  relation        TEXT NOT NULL,             -- father | mother | guardian
  is_primary_contact INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (student_id, guardian_id)
);

-- Admission workflow: enquiry -> applied -> enrolled (or rejected/withdrawn)
CREATE TABLE admissions (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  applied_class_id TEXT REFERENCES classes(id),
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id),
  stage           TEXT NOT NULL DEFAULT 'enquiry', -- enquiry | applied | interview | enrolled | rejected | withdrawn
  applied_at      TEXT NOT NULL,
  decided_at      TEXT,
  decided_by      TEXT REFERENCES users(id),
  remarks         TEXT,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

-- ============================================================================
-- Sync bookkeeping
-- ============================================================================

-- Local-only (SQLite). Not mirrored to Postgres. Every mutating write to a
-- syncable table also inserts a row here, inside the same transaction.
CREATE TABLE sync_outbox (
  id              TEXT PRIMARY KEY,          -- UUID
  entity_table    TEXT NOT NULL,             -- e.g. "students"
  entity_id       TEXT NOT NULL,
  op              TEXT NOT NULL,             -- insert | update | delete
  payload_json    TEXT NOT NULL,             -- full row snapshot at write time
  client_ts       TEXT NOT NULL,
  synced_at       TEXT                       -- NULL until successfully pushed
);

CREATE INDEX idx_sync_outbox_unsynced ON sync_outbox (synced_at) WHERE synced_at IS NULL;

-- Local-only (SQLite). Tracks the last server_seq cursor received from cloud-api.
CREATE TABLE sync_state (
  id              TEXT PRIMARY KEY DEFAULT 'singleton',
  last_pulled_server_seq INTEGER NOT NULL DEFAULT 0,
  last_synced_at  TEXT
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX idx_branches_tenant ON branches (tenant_id);
CREATE INDEX idx_users_tenant_branch ON users (tenant_id, branch_id);
CREATE INDEX idx_classes_branch_session ON classes (branch_id, academic_session_id);
CREATE INDEX idx_sections_class ON sections (class_id);
CREATE INDEX idx_students_tenant_branch ON students (tenant_id, branch_id);
CREATE INDEX idx_students_class_section ON students (current_class_id, current_section_id);
CREATE INDEX idx_student_guardians_student ON student_guardians (student_id);
CREATE INDEX idx_admissions_branch_stage ON admissions (branch_id, stage);
