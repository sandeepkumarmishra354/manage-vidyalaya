-- 0006_houses.sql
-- School "houses" (Red/Blue/Green/Yellow-style competition teams) with a
-- points system: house_point_events is an append-only ledger (never
-- updated in place, only inserted -- a leaderboard is SUM(points) grouped
-- by house), so the running total is always reconstructable and every
-- award/deduction has an audit trail of who gave it and why.

CREATE TABLE houses (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  name            TEXT NOT NULL,             -- e.g. "Red House"
  color           TEXT,                      -- hex, e.g. "#dc2626", for UI badges
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (branch_id, name)
);

CREATE TABLE student_houses (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  house_id        TEXT NOT NULL REFERENCES houses(id),
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (student_id)
);

CREATE TABLE house_point_events (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  house_id        TEXT NOT NULL REFERENCES houses(id),
  student_id      TEXT REFERENCES students(id), -- NULL = awarded to the house as a whole
  academic_session_id TEXT REFERENCES academic_sessions(id),
  points          INTEGER NOT NULL,          -- negative for deductions
  reason          TEXT NOT NULL,
  event_date      TEXT NOT NULL,
  awarded_by      TEXT REFERENCES users(id),
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_houses_branch ON houses (branch_id);
CREATE INDEX idx_student_houses_house ON student_houses (house_id);
CREATE INDEX idx_house_point_events_house ON house_point_events (house_id);
CREATE INDEX idx_house_point_events_session ON house_point_events (academic_session_id);
