-- 0011_teacher_assignments.sql
-- Which staff member teaches which subject to which class/section in a given
-- academic session. `section_id` is nullable to allow a whole-class
-- assignment when a class has no sections.

CREATE TABLE teacher_subject_assignments (
  id                   TEXT PRIMARY KEY,          -- UUID
  tenant_id            TEXT NOT NULL REFERENCES tenants(id),
  branch_id            TEXT NOT NULL REFERENCES branches(id),
  staff_id             TEXT NOT NULL REFERENCES staff(id),
  class_id             TEXT NOT NULL REFERENCES classes(id),
  section_id           TEXT REFERENCES sections(id),
  subject_id           TEXT NOT NULL REFERENCES subjects(id),
  academic_session_id  TEXT NOT NULL REFERENCES academic_sessions(id),
  updated_at           TEXT NOT NULL,
  updated_by           TEXT,
  deleted_at           TEXT,
  version              INTEGER NOT NULL DEFAULT 1,
  UNIQUE (staff_id, class_id, section_id, subject_id, academic_session_id)
);

CREATE INDEX idx_teacher_assignments_staff ON teacher_subject_assignments (staff_id);
CREATE INDEX idx_teacher_assignments_class ON teacher_subject_assignments (class_id, section_id);
