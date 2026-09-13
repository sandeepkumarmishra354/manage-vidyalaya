-- 0010_staff.sql
-- Employee/HR records, separate from `users` (login identity). Not every
-- staff member has a login (e.g. a driver or peon); `user_id` is set only
-- once an admin creates a login for them via `create_staff_login`. Only
-- first_name/employee_code/designation/date_of_joining/status are mandatory
-- -- everything else is optional data capture.

CREATE TABLE staff (
  id                      TEXT PRIMARY KEY,          -- UUID
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  branch_id               TEXT NOT NULL REFERENCES branches(id),
  user_id                 TEXT REFERENCES users(id), -- NULL until a login is created
  employee_code           TEXT NOT NULL,
  first_name              TEXT NOT NULL,
  last_name               TEXT,
  date_of_birth           TEXT,
  gender                  TEXT,
  phone                   TEXT,
  personal_email          TEXT,
  address                 TEXT,
  city                    TEXT,
  state                   TEXT,
  pincode                 TEXT,
  designation             TEXT NOT NULL,             -- free text, e.g. "PGT Mathematics", "Accountant"
  department              TEXT,
  employment_type         TEXT NOT NULL DEFAULT 'full_time', -- full_time | part_time | contract
  date_of_joining          TEXT NOT NULL,
  date_of_leaving          TEXT,
  status                  TEXT NOT NULL DEFAULT 'active', -- active | inactive | on_leave | terminated
  qualification            TEXT,
  blood_group              TEXT,
  photo_path                TEXT,
  pan_number                TEXT,
  aadhaar_number             TEXT,
  bank_account_number        TEXT,
  bank_ifsc                  TEXT,
  bank_name                  TEXT,
  pf_number                  TEXT,
  esi_number                 TEXT,
  uan_number                  TEXT,
  emergency_contact_name       TEXT,
  emergency_contact_phone       TEXT,
  notes                    TEXT,
  updated_at              TEXT NOT NULL,
  updated_by              TEXT,
  deleted_at              TEXT,
  version                 INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, employee_code)
);

CREATE INDEX idx_staff_branch ON staff (branch_id);
CREATE INDEX idx_staff_user ON staff (user_id);

-- The correct FK target for "who is the class teacher" is a staff member,
-- not a login (`users`). The old `sections.class_teacher_id -> users` column
-- (added in 0001_core.sql) is unused anywhere in the app and is left as-is;
-- this new column is what the app actually reads/writes going forward.
ALTER TABLE sections ADD COLUMN class_teacher_staff_id TEXT REFERENCES staff(id);
