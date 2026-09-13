-- 0016_audit_log.sql
-- Generic, append-only audit trail. Every create/update/delete/status-change
-- across the command layer writes one row here in the same transaction as
-- the mutation (see audit.rs::record_audit). Only `insert` ops are ever
-- produced against this table -- it is synced like any other table but
-- never updated or deleted once written.

CREATE TABLE audit_log (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT REFERENCES branches(id),
  actor_user_id   TEXT REFERENCES users(id),
  entity_table    TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  action          TEXT NOT NULL,             -- create | update | delete | login | logout
  summary         TEXT NOT NULL,
  before_json     TEXT,
  after_json      TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX idx_audit_log_tenant_created ON audit_log (tenant_id, created_at);
CREATE INDEX idx_audit_log_entity ON audit_log (entity_table, entity_id);
