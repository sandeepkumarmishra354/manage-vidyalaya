-- 0008_transport.sql
-- Bus routes/stops and a student's current transport assignment.

CREATE TABLE transport_routes (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  name            TEXT NOT NULL,             -- e.g. "Route 3 - North Loop"
  vehicle_number  TEXT,
  driver_name     TEXT,
  driver_phone    TEXT,
  capacity        INTEGER,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE transport_stops (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  route_id        TEXT NOT NULL REFERENCES transport_routes(id),
  name            TEXT NOT NULL,
  sequence        INTEGER NOT NULL DEFAULT 0,
  pickup_time     TEXT,                      -- HH:MM, local
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE student_transport (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  route_id        TEXT NOT NULL REFERENCES transport_routes(id),
  stop_id         TEXT NOT NULL REFERENCES transport_stops(id),
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (student_id)
);

CREATE INDEX idx_transport_routes_branch ON transport_routes (branch_id);
CREATE INDEX idx_transport_stops_route ON transport_stops (route_id);
CREATE INDEX idx_student_transport_route ON student_transport (route_id);
