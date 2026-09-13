-- 0009_rbac.sql
-- Granular permissions on top of the existing roles/user_roles tables. The
-- catalog of valid `permission_key` values (e.g. "students.edit",
-- "fees.record_payment") is intentionally NOT a table here -- it's a
-- hand-kept const list in code (Rust: models.rs PERMISSION_CATALOG, TS:
-- lib/permissions.ts), mirroring how TOGGLEABLE_MODULES is done. This table
-- only stores which keys are granted to which role.

CREATE TABLE role_permissions (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  role_id         TEXT NOT NULL REFERENCES roles(id),
  permission_key  TEXT NOT NULL,             -- e.g. "students.edit"
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (role_id, permission_key)
);

CREATE INDEX idx_role_permissions_role ON role_permissions (role_id);

-- System roles (super_admin, branch_admin, accountant, teacher, front_desk)
-- are seeded and protected from deletion; custom roles an admin creates are
-- not. `roles` (0001_core.sql) predates the soft-delete convention used
-- everywhere else -- add it here now that roles can be deleted.
ALTER TABLE roles ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;
ALTER TABLE roles ADD COLUMN deleted_at TEXT;
