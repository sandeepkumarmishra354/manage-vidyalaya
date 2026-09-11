-- Local-only tables. Never synced to cloud-api, never present in the Postgres schema.

CREATE TABLE app_settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL
);
