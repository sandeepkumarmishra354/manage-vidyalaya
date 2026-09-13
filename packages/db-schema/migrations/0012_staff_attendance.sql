-- 0012_staff_attendance.sql
-- Daily staff attendance, mirroring attendance_records (0002_attendance.sql)
-- for students. Feeds payroll's loss-of-pay computation (0013_payroll.sql).

CREATE TABLE staff_attendance (
  id               TEXT PRIMARY KEY,          -- UUID
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  branch_id        TEXT NOT NULL REFERENCES branches(id),
  staff_id         TEXT NOT NULL REFERENCES staff(id),
  attendance_date  TEXT NOT NULL,             -- YYYY-MM-DD
  status           TEXT NOT NULL,             -- present | absent | half_day | leave | holiday
  check_in_time    TEXT,
  check_out_time   TEXT,
  marked_by        TEXT REFERENCES users(id),
  remarks          TEXT,
  updated_at       TEXT NOT NULL,
  updated_by       TEXT,
  deleted_at       TEXT,
  version          INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, staff_id, attendance_date)
);

CREATE INDEX idx_staff_attendance_staff_date ON staff_attendance (staff_id, attendance_date);
CREATE INDEX idx_staff_attendance_branch_date ON staff_attendance (branch_id, attendance_date);
