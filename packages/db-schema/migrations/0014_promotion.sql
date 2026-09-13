-- 0014_promotion.sql
-- Historical per-session enrollment (students.current_class_id/current_
-- section_id stays as a denormalized "current" pointer, kept in sync by
-- promotion/enrollment writes) plus bulk session-rollover ("promote class to
-- next session") batches.

CREATE TABLE student_enrollments (
  id                   TEXT PRIMARY KEY,          -- UUID
  tenant_id            TEXT NOT NULL REFERENCES tenants(id),
  branch_id            TEXT NOT NULL REFERENCES branches(id),
  student_id           TEXT NOT NULL REFERENCES students(id),
  academic_session_id  TEXT NOT NULL REFERENCES academic_sessions(id),
  class_id             TEXT NOT NULL REFERENCES classes(id),
  section_id           TEXT REFERENCES sections(id),
  roll_number          TEXT,
  status               TEXT NOT NULL DEFAULT 'promoted', -- promoted | retained | withdrawn | transferred
  updated_at           TEXT NOT NULL,
  updated_by           TEXT,
  deleted_at           TEXT,
  version              INTEGER NOT NULL DEFAULT 1,
  UNIQUE (student_id, academic_session_id)
);

CREATE TABLE promotion_batches (
  id                TEXT PRIMARY KEY,          -- UUID
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  branch_id         TEXT NOT NULL REFERENCES branches(id),
  from_session_id   TEXT NOT NULL REFERENCES academic_sessions(id),
  to_session_id     TEXT NOT NULL REFERENCES academic_sessions(id),
  class_mapping_json TEXT NOT NULL,            -- {"<from_class_id>": "<to_class_id>", ...}
  status            TEXT NOT NULL DEFAULT 'draft', -- draft | completed
  executed_at       TEXT,
  executed_by       TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL
);

CREATE TABLE promotion_batch_items (
  id                  TEXT PRIMARY KEY,          -- UUID
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  promotion_batch_id  TEXT NOT NULL REFERENCES promotion_batches(id),
  student_id          TEXT NOT NULL REFERENCES students(id),
  from_class_id       TEXT REFERENCES classes(id),
  from_section_id     TEXT REFERENCES sections(id),
  to_class_id         TEXT REFERENCES classes(id),
  to_section_id       TEXT REFERENCES sections(id),
  decision            TEXT NOT NULL DEFAULT 'promote', -- promote | retain | withdraw
  remarks             TEXT,
  UNIQUE (promotion_batch_id, student_id)
);

CREATE INDEX idx_student_enrollments_student ON student_enrollments (student_id);
CREATE INDEX idx_student_enrollments_session ON student_enrollments (academic_session_id);
CREATE INDEX idx_promotion_batches_branch ON promotion_batches (branch_id);
CREATE INDEX idx_promotion_batch_items_batch ON promotion_batch_items (promotion_batch_id);
