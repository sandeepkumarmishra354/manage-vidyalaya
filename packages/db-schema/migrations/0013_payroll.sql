-- 0013_payroll.sql
-- Component-based salary structure + monthly payroll runs. Loss-of-pay days
-- are computed from staff_attendance at generation time (not stored as a
-- rule here); PF/ESI/Professional-Tax/TDS are manual deduction components,
-- not auto-calculated against government slabs (see docs/architecture.md
-- for the explicit scope note). All money in integer paise.

CREATE TABLE salary_structures (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  staff_id        TEXT NOT NULL REFERENCES staff(id),
  effective_from  TEXT NOT NULL,             -- YYYY-MM-DD; latest row <= period start is used
  basic_amount    INTEGER NOT NULL,          -- paise
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE salary_components (
  id                   TEXT PRIMARY KEY,          -- UUID
  tenant_id            TEXT NOT NULL REFERENCES tenants(id),
  salary_structure_id  TEXT NOT NULL REFERENCES salary_structures(id),
  component_name       TEXT NOT NULL,             -- e.g. "HRA", "PF", "Professional Tax"
  component_type       TEXT NOT NULL,             -- earning | deduction
  calculation_type     TEXT NOT NULL,             -- fixed | percent_of_basic
  amount               INTEGER,                   -- paise, when calculation_type = fixed
  percent              REAL,                       -- when calculation_type = percent_of_basic
  updated_at           TEXT NOT NULL,
  updated_by           TEXT,
  deleted_at           TEXT,
  version              INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE payroll_runs (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  period_month    INTEGER NOT NULL,          -- 1-12
  period_year     INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft', -- draft | finalized | paid
  generated_at    TEXT NOT NULL,
  generated_by    TEXT REFERENCES users(id),
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (branch_id, period_month, period_year)
);

CREATE TABLE payslips (
  id               TEXT PRIMARY KEY,          -- UUID
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  payroll_run_id   TEXT NOT NULL REFERENCES payroll_runs(id),
  staff_id         TEXT NOT NULL REFERENCES staff(id),
  days_in_month    INTEGER NOT NULL,
  days_present     REAL NOT NULL,
  days_lop         REAL NOT NULL DEFAULT 0,   -- loss-of-pay days, derived from staff_attendance
  gross_earnings   INTEGER NOT NULL,          -- paise
  total_deductions INTEGER NOT NULL,          -- paise
  net_pay          INTEGER NOT NULL,          -- paise
  status           TEXT NOT NULL DEFAULT 'draft', -- draft | finalized | paid
  paid_on          TEXT,
  remarks          TEXT,
  updated_at       TEXT NOT NULL,
  updated_by       TEXT,
  deleted_at       TEXT,
  version          INTEGER NOT NULL DEFAULT 1,
  UNIQUE (payroll_run_id, staff_id)
);

CREATE TABLE payslip_line_items (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  payslip_id      TEXT NOT NULL REFERENCES payslips(id),
  component_name  TEXT NOT NULL,
  component_type  TEXT NOT NULL,             -- earning | deduction
  amount          INTEGER NOT NULL,          -- paise
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_salary_structures_staff ON salary_structures (staff_id, effective_from);
CREATE INDEX idx_salary_components_structure ON salary_components (salary_structure_id);
CREATE INDEX idx_payroll_runs_branch_period ON payroll_runs (branch_id, period_year, period_month);
CREATE INDEX idx_payslips_run ON payslips (payroll_run_id);
CREATE INDEX idx_payslips_staff ON payslips (staff_id);
CREATE INDEX idx_payslip_line_items_payslip ON payslip_line_items (payslip_id);
