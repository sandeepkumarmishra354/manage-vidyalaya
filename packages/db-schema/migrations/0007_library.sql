-- 0007_library.sql
-- Book catalog plus a simple issue/return ledger. available_copies is
-- denormalized (kept in sync by the issue/return commands, same pattern as
-- fee_invoices.amount_paid) so listing available books doesn't need a
-- correlated subquery.

CREATE TABLE library_books (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  title           TEXT NOT NULL,
  author          TEXT,
  isbn            TEXT,
  category        TEXT,
  total_copies    INTEGER NOT NULL DEFAULT 1,
  available_copies INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE library_issues (
  id              TEXT PRIMARY KEY,          -- UUID
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  book_id         TEXT NOT NULL REFERENCES library_books(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  issued_date     TEXT NOT NULL,
  due_date        TEXT NOT NULL,
  returned_date   TEXT,
  status          TEXT NOT NULL DEFAULT 'issued', -- issued | returned | lost
  issued_by       TEXT REFERENCES users(id),
  updated_at      TEXT NOT NULL,
  updated_by      TEXT,
  deleted_at      TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_library_books_branch ON library_books (branch_id);
CREATE INDEX idx_library_issues_book ON library_issues (book_id);
CREATE INDEX idx_library_issues_student ON library_issues (student_id);
CREATE INDEX idx_library_issues_status ON library_issues (branch_id, status);
