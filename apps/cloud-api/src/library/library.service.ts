import { randomUUID } from "node:crypto";

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateBookDto } from "./dto/create-book.dto.js";
import type { IssueBookDto } from "./dto/issue-book.dto.js";
import type { UpdateBookDto } from "./dto/update-book.dto.js";

@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createBook(tenantId: string, dto: CreateBookDto) {
    return this.prisma.libraryBook.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: dto.branch_id,
        title: dto.title,
        author: dto.author ?? null,
        isbn: dto.isbn ?? null,
        category: dto.category ?? null,
        totalCopies: dto.total_copies,
        availableCopies: dto.total_copies,
        updatedAt: new Date(),
      },
    });
  }

  // Books can't have their total_copies edited below however many are
  // currently on loan -- that would make available_copies negative.
  async updateBook(tenantId: string, actorUserId: string, id: string, dto: UpdateBookDto) {
    const book = await this.prisma.libraryBook.findUniqueOrThrow({ where: { id } });
    const onLoan = book.totalCopies - book.availableCopies;
    if (dto.total_copies < onLoan) {
      throw new BadRequestException(`cannot reduce total copies below ${onLoan} currently on loan`);
    }
    const newAvailable = dto.total_copies - onLoan;
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.libraryBook.update({
        where: { id },
        data: {
          title: dto.title,
          author: dto.author ?? null,
          isbn: dto.isbn ?? null,
          category: dto.category ?? null,
          totalCopies: dto.total_copies,
          availableCopies: newAvailable,
          updatedAt: now,
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });
      await this.audit.record(tx, {
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

  async listBooks(branchId: string, search?: string) {
    const term = (search ?? "").trim();
    return this.prisma.libraryBook.findMany({
      where: {
        branchId,
        deletedAt: null,
        ...(term
          ? { OR: [{ title: { contains: term, mode: "insensitive" } }, { author: { contains: term, mode: "insensitive" } }] }
          : {}),
      },
      orderBy: { title: "asc" },
    });
  }

  // Issues a copy of a book to a student: decrements available_copies and
  // creates an issue record, refusing if no copies are available.
  async issueBook(tenantId: string, actorUserId: string, dto: IssueBookDto) {
    const book = await this.prisma.libraryBook.findFirst({ where: { id: dto.book_id } });
    if (!book) {
      throw new NotFoundException("book not found");
    }
    if (book.availableCopies <= 0) {
      throw new BadRequestException("no copies available to issue");
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.libraryBook.update({
        where: { id: dto.book_id },
        data: { availableCopies: { decrement: 1 }, updatedAt: now, version: { increment: 1 } },
      });

      return tx.libraryIssue.create({
        data: {
          id: randomUUID(),
          tenantId,
          branchId: book.branchId,
          bookId: dto.book_id,
          studentId: dto.student_id,
          issuedDate: now,
          dueDate: new Date(dto.due_date),
          status: "issued",
          issuedBy: actorUserId,
          updatedAt: now,
        },
      });
    });
  }

  async returnBook(issueId: string) {
    const issue = await this.prisma.libraryIssue.findFirst({ where: { id: issueId } });
    if (!issue) {
      throw new NotFoundException("issue not found");
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.libraryIssue.update({
        where: { id: issueId },
        data: { status: "returned", returnedDate: now, updatedAt: now, version: { increment: 1 } },
      });
      await tx.libraryBook.update({
        where: { id: issue.bookId },
        data: { availableCopies: { increment: 1 }, updatedAt: now, version: { increment: 1 } },
      });
      return updated;
    });
  }

  async listIssues(branchId: string, status?: string) {
    const issues = await this.prisma.libraryIssue.findMany({
      where: { branchId, deletedAt: null, ...(status ? { status } : {}) },
      include: { book: true, student: true },
      orderBy: { issuedDate: "desc" },
    });

    return issues.map((i) => ({
      id: i.id,
      book_id: i.bookId,
      book_title: i.book.title,
      student_id: i.studentId,
      student_name: [i.student.firstName, i.student.lastName].filter(Boolean).join(" "),
      issued_date: i.issuedDate,
      due_date: i.dueDate,
      returned_date: i.returnedDate,
      status: i.status,
    }));
  }
}
