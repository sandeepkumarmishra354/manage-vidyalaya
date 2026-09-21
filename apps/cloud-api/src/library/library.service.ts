import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { DbService } from "../db/db.service.js";
import { findOneForTenant, insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { CreateBookDto } from "./dto/create-book.dto.js";
import type { IssueBookDto } from "./dto/issue-book.dto.js";
import type { UpdateBookDto } from "./dto/update-book.dto.js";

export interface LibraryBookRow extends TenantRow {
  branch_id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  category: string | null;
  total_copies: number;
  available_copies: number;
}

export interface LibraryIssueRow extends TenantRow {
  branch_id: string;
  book_id: string;
  student_id: string;
  issued_date: Date;
  due_date: Date;
  returned_date: Date | null;
  status: string;
}

@Injectable()
export class LibraryService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async createBook(tenantId: string, dto: CreateBookDto) {
    return this.db.withTransaction(tenantId, (client) =>
      insertRow<LibraryBookRow>(client, "library_books", tenantId, {
        branch_id: dto.branch_id,
        title: dto.title,
        author: dto.author ?? null,
        isbn: dto.isbn ?? null,
        category: dto.category ?? null,
        total_copies: dto.total_copies,
        available_copies: dto.total_copies,
        updated_at: new Date(),
      }),
    );
  }

  // Books can't have their total_copies edited below however many are
  // currently on loan -- that would make available_copies negative.
  async updateBook(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateBookDto,
    branchId?: string | null,
  ) {
    return this.db.withTransaction(tenantId, async (client) => {
      const book = await findOneForTenant<LibraryBookRow>(client, "library_books", tenantId, id, branchId);
      if (!book) {
        throw new NotFoundException("book not found");
      }
      const onLoan = book.total_copies - book.available_copies;
      if (dto.total_copies < onLoan) {
        throw new BadRequestException(`cannot reduce total copies below ${onLoan} currently on loan`);
      }
      const newAvailable = dto.total_copies - onLoan;

      const updated = await updateRow<LibraryBookRow>(
        client,
        "library_books",
        tenantId,
        id,
        {
          title: dto.title,
          author: dto.author ?? null,
          isbn: dto.isbn ?? null,
          category: dto.category ?? null,
          total_copies: dto.total_copies,
          available_copies: newAvailable,
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "library_books",
        entityId: id,
        action: "update",
        summary: `Updated book '${dto.title}'`,
      });

      return updated;
    });
  }

  listBooks(tenantId: string, branchId: string, search?: string) {
    const term = (search ?? "").trim();
    const conditions = ["tenant_id = $1", "branch_id = $2", "deleted_at IS NULL"];
    const values: unknown[] = [tenantId, branchId];
    if (term) {
      values.push(`%${term}%`);
      conditions.push(`(title ILIKE $${values.length} OR author ILIKE $${values.length} OR isbn ILIKE $${values.length})`);
    }
    return this.db.query<LibraryBookRow>(
      tenantId,
      `SELECT * FROM library_books WHERE ${conditions.join(" AND ")} ORDER BY title ASC`,
      values,
    );
  }

  // Issues a copy of a book to a student: decrements available_copies and
  // creates an issue record, refusing if no copies are available.
  async issueBook(tenantId: string, actorUserId: string, dto: IssueBookDto, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const book = await findOneForTenant<LibraryBookRow>(client, "library_books", tenantId, dto.book_id, branchId);
      if (!book) {
        throw new NotFoundException("book not found");
      }
      if (book.available_copies <= 0) {
        throw new BadRequestException("no copies available to issue");
      }

      const now = new Date();
      await updateRow<LibraryBookRow>(
        client,
        "library_books",
        tenantId,
        dto.book_id,
        {
          available_copies: book.available_copies - 1,
          updated_at: now,
        },
        branchId,
      );

      return insertRow<LibraryIssueRow>(client, "library_issues", tenantId, {
        branch_id: book.branch_id,
        book_id: dto.book_id,
        student_id: dto.student_id,
        issued_date: now,
        due_date: new Date(dto.due_date),
        status: "issued",
        issued_by: actorUserId,
        updated_at: now,
      });
    });
  }

  async returnBook(tenantId: string, issueId: string, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const issue = await findOneForTenant<LibraryIssueRow>(client, "library_issues", tenantId, issueId, branchId);
      if (!issue) {
        throw new NotFoundException("issue not found");
      }

      const now = new Date();
      const updated = await updateRow<LibraryIssueRow>(
        client,
        "library_issues",
        tenantId,
        issueId,
        {
          status: "returned",
          returned_date: now,
          updated_at: now,
        },
        branchId,
      );

      const book = await findOneForTenant<LibraryBookRow>(client, "library_books", tenantId, issue.book_id, branchId);
      if (book) {
        await updateRow<LibraryBookRow>(
          client,
          "library_books",
          tenantId,
          issue.book_id,
          {
            available_copies: book.available_copies + 1,
            updated_at: now,
          },
          branchId,
        );
      }

      return updated;
    });
  }

  async listIssues(
    tenantId: string,
    branchId: string,
    filters?: { status?: string; studentId?: string; from?: string; to?: string },
  ) {
    const { status, studentId, from, to } = filters ?? {};
    const conditions = ["li.tenant_id = $1", "li.branch_id = $2", "li.deleted_at IS NULL"];
    const values: unknown[] = [tenantId, branchId];
    if (status) {
      values.push(status);
      conditions.push(`li.status = $${values.length}`);
    }
    if (studentId) {
      values.push(studentId);
      conditions.push(`li.student_id = $${values.length}`);
    }
    if (from) {
      values.push(new Date(from));
      conditions.push(`li.issued_date >= $${values.length}`);
    }
    if (to) {
      values.push(new Date(to));
      conditions.push(`li.issued_date <= $${values.length}`);
    }

    const rows = await this.db.query<{
      id: string;
      book_id: string;
      book_title: string;
      student_id: string;
      first_name: string;
      last_name: string | null;
      issued_date: Date;
      due_date: Date;
      returned_date: Date | null;
      status: string;
    }>(
      tenantId,
      `SELECT li.id, li.book_id, b.title AS book_title, li.student_id, s.first_name, s.last_name,
              li.issued_date, li.due_date, li.returned_date, li.status
       FROM library_issues li
       JOIN library_books b ON b.id = li.book_id
       JOIN students s ON s.id = li.student_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY li.issued_date DESC`,
      values,
    );

    return rows.map((i) => ({
      id: i.id,
      book_id: i.book_id,
      book_title: i.book_title,
      student_id: i.student_id,
      student_name: [i.first_name, i.last_name].filter(Boolean).join(" "),
      issued_date: i.issued_date,
      due_date: i.due_date,
      returned_date: i.returned_date,
      status: i.status,
    }));
  }

  // Aggregate stats for the History & Reports tab. Overdue means an issue
  // that's still outstanding ("issued") with a due_date already in the past.
  async getLibraryStats(tenantId: string, branchId: string) {
    const [booksRow, issuedRow, overdueRow] = await Promise.all([
      this.db.queryOne<{ total_books: string; total_copies: string | null; available_copies: string | null }>(
        tenantId,
        `SELECT COUNT(*)::text AS total_books, COALESCE(SUM(total_copies), 0)::text AS total_copies,
                COALESCE(SUM(available_copies), 0)::text AS available_copies
         FROM library_books WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL`,
        [tenantId, branchId],
      ),
      this.db.queryOne<{ count: string }>(
        tenantId,
        "SELECT COUNT(*)::text AS count FROM library_issues WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL AND status = 'issued'",
        [tenantId, branchId],
      ),
      this.db.queryOne<{ count: string }>(
        tenantId,
        "SELECT COUNT(*)::text AS count FROM library_issues WHERE tenant_id = $1 AND branch_id = $2 AND deleted_at IS NULL AND status = 'issued' AND due_date < now()",
        [tenantId, branchId],
      ),
    ]);

    return {
      total_books: Number(booksRow?.total_books ?? "0"),
      total_copies: Number(booksRow?.total_copies ?? "0"),
      available_copies: Number(booksRow?.available_copies ?? "0"),
      issued_count: Number(issuedRow?.count ?? "0"),
      overdue_count: Number(overdueRow?.count ?? "0"),
    };
  }
}
