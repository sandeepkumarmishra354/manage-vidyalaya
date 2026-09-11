-- 0003_fees.sql
-- Fee structures (what's charged), invoices (what a specific student owes
-- for a structure in a session), and payments (money actually received
-- against an invoice, possibly in installments).

CREATE TABLE fee_structures (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id),
  class_id        TEXT REFERENCES classes(id), -- NULL = applies to every class in the branch
  name            TEXT NOT NULL,             -- e.g. "Tuition Fee", "Transport Fee"
  amount          INTEGER NOT NULL,          -- minor units (paise), avoids float rounding
  frequency       TEXT NOT NULL DEFAULT 'one_time', -- one_time | monthly | quarterly | annual
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE fee_invoices (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  fee_structure_id TEXT NOT NULL REFERENCES fee_structures(id),
  academic_session_id TEXT NOT NULL REFERENCES academic_sessions(id),
  amount_due      INTEGER NOT NULL,          -- minor units (paise)
  amount_paid     INTEGER NOT NULL DEFAULT 0, -- minor units (paise), denormalized sum of payments
  due_date        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | partial | paid | overdue | waived
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE fee_payments (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  invoice_id      TEXT NOT NULL REFERENCES fee_invoices(id),
  amount          INTEGER NOT NULL,          -- minor units (paise)
  payment_method  TEXT NOT NULL DEFAULT 'cash', -- cash | cheque | upi | card | online | bank_transfer
  payment_date    TEXT NOT NULL,
  receipt_number  TEXT,
  recorded_by     TEXT REFERENCES users(id),
  remarks         TEXT,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_fee_structures_branch_session ON fee_structures (branch_id, academic_session_id);
CREATE INDEX idx_fee_invoices_student ON fee_invoices (student_id);
CREATE INDEX idx_fee_invoices_branch_status ON fee_invoices (branch_id, status);
CREATE INDEX idx_fee_payments_invoice ON fee_payments (invoice_id);
