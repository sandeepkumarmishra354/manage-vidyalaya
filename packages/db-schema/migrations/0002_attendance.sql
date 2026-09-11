-- 0002_attendance.sql
-- Daily attendance, marked per student per day. One row per student per day
-- (enforced by the unique index below) so re-marking a day just updates it.

CREATE TABLE attendance_records (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  class_id        TEXT REFERENCES classes(id),
  section_id      TEXT REFERENCES sections(id),
  attendance_date TEXT NOT NULL,             -- YYYY-MM-DD
  status          TEXT NOT NULL,             -- present | absent | late | half_day | leave
  marked_by       TEXT REFERENCES users(id),
  remarks         TEXT,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, student_id, attendance_date)
);

CREATE INDEX idx_attendance_branch_date ON attendance_records (branch_id, attendance_date);
CREATE INDEX idx_attendance_class_section_date ON attendance_records (class_id, section_id, attendance_date);
CREATE INDEX idx_attendance_student ON attendance_records (student_id);
