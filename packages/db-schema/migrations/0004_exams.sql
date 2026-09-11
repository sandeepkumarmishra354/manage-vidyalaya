-- 0004_exams.sql
-- Subjects (a per-branch lookup), exams (a named assessment for a class in a
-- session, e.g. "Mid-Term"), and marks (one row per student per subject per
-- exam -- max_marks is stored on the row itself rather than a separate
-- exam_subjects join table, trading a little denormalization for one fewer
-- table at this scale).

CREATE TABLE subjects (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  name            TEXT NOT NULL,             -- e.g. "Mathematics"
  code            TEXT,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE exams (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id),
  class_id        TEXT NOT NULL REFERENCES classes(id),
  name            TEXT NOT NULL,             -- e.g. "Mid-Term", "Final"
  exam_date       TEXT,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE exam_marks (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  exam_id         TEXT NOT NULL REFERENCES exams(id),
  subject_id      TEXT NOT NULL REFERENCES subjects(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  max_marks       INTEGER NOT NULL DEFAULT 100,
  marks_obtained  REAL,                      -- NULL = not yet entered / absent
  is_absent       INTEGER NOT NULL DEFAULT 0,
  remarks         TEXT,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (exam_id, subject_id, student_id)
);

CREATE INDEX idx_subjects_branch ON subjects (branch_id);
CREATE INDEX idx_exams_branch_class_session ON exams (branch_id, class_id, academic_session_id);
CREATE INDEX idx_exam_marks_exam ON exam_marks (exam_id);
CREATE INDEX idx_exam_marks_student ON exam_marks (student_id);
