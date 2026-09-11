-- 0005_module_settings.sql
-- Per-branch feature toggles, so a school can turn optional modules off
-- entirely (e.g. a branch with no library or bus service). Core modules
-- (students/admissions, academic setup, dashboard) are never toggleable and
-- have no row here; everything else defaults to enabled if no row exists
-- for it yet (see get_module_settings, which fills in the default).

CREATE TABLE module_settings (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  module_key      TEXT NOT NULL,             -- attendance | fees | exams | library | transport | houses | id_cards
  is_enabled      INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (branch_id, module_key)
);

CREATE INDEX idx_module_settings_branch ON module_settings (branch_id);
