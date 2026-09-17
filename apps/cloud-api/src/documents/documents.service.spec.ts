import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { StorageService } from "../storage/storage.service.js";
import { DocumentsService } from "./documents.service.js";

function makePrismaMock() {
  const tx = {
    studentDocument: { create: vi.fn(), update: vi.fn() },
    staffDocument: { create: vi.fn(), update: vi.fn() },
  };
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
    student: { findFirst: vi.fn() },
    staff: { findFirst: vi.fn() },
    studentDocument: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    staffDocument: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  } as unknown as PrismaService & {
    __tx: typeof tx;
    student: { findFirst: ReturnType<typeof vi.fn> };
    staff: { findFirst: ReturnType<typeof vi.fn> };
    studentDocument: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    staffDocument: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
}

function makeStorageMock() {
  return {
    createUploadUrl: vi.fn(),
    createDownloadUrl: vi.fn(),
    deleteObject: vi.fn(),
  } as unknown as StorageService & {
    createUploadUrl: ReturnType<typeof vi.fn>;
    createDownloadUrl: ReturnType<typeof vi.fn>;
    deleteObject: ReturnType<typeof vi.fn>;
  };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("DocumentsService", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let storage: ReturnType<typeof makeStorageMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: DocumentsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    storage = makeStorageMock();
    audit = makeAuditMock();
    service = new DocumentsService(prisma, storage, audit);
  });

  describe("requestUploadUrl", () => {
    it("404s when the owner doesn't exist in this tenant", async () => {
      prisma.student.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.requestUploadUrl("tenant-1", "student", "student-1", { file_name: "a.pdf", content_type: "application/pdf" }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.createUploadUrl).not.toHaveBeenCalled();
    });

    it("generates a storage key preserving the file extension", async () => {
      prisma.student.findFirst.mockResolvedValueOnce({ id: "student-1", branchId: "branch-1" });
      storage.createUploadUrl.mockResolvedValueOnce({ url: "http://x", method: "PUT", expires_at: "now" });

      const result = await service.requestUploadUrl("tenant-1", "student", "student-1", {
        file_name: "report.pdf",
        content_type: "application/pdf",
      });

      expect(storage.createUploadUrl).toHaveBeenCalledWith(expect.stringMatching(/^doc-.+\.pdf$/), "application/pdf");
      expect(result.storage_key).toMatch(/^doc-.+\.pdf$/);
    });
  });

  describe("create", () => {
    it("creates a StudentDocument row scoped to the owner's branch and records an audit entry", async () => {
      prisma.student.findFirst.mockResolvedValueOnce({ id: "student-1", branchId: "branch-1" });
      prisma.__tx.studentDocument.create.mockResolvedValueOnce({
        id: "doc-1",
        label: "Birth Certificate",
        fileName: "cert.pdf",
        mimeType: "application/pdf",
        fileSize: 100,
        uploadedByUserId: "user-1",
        createdAt: new Date(),
      });

      await service.create("tenant-1", "user-1", "student", "student-1", {
        label: "Birth Certificate",
        storage_key: "doc-1.pdf",
        file_name: "cert.pdf",
        mime_type: "application/pdf",
        file_size: 100,
      });

      expect(prisma.__tx.studentDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ studentId: "student-1", branchId: "branch-1", tenantId: "tenant-1" }),
        }),
      );
      expect(audit.record).toHaveBeenCalled();
    });

    it("creates a StaffDocument row when ownerType is staff", async () => {
      prisma.staff.findFirst.mockResolvedValueOnce({ id: "staff-1", branchId: "branch-2" });
      prisma.__tx.staffDocument.create.mockResolvedValueOnce({
        id: "doc-2",
        label: "Resume",
        fileName: "resume.pdf",
        mimeType: "application/pdf",
        fileSize: 50,
        uploadedByUserId: "user-1",
        createdAt: new Date(),
      });

      await service.create("tenant-1", "user-1", "staff", "staff-1", {
        label: "Resume",
        storage_key: "doc-2.pdf",
        file_name: "resume.pdf",
        mime_type: "application/pdf",
        file_size: 50,
      });

      expect(prisma.__tx.staffDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ staffId: "staff-1", branchId: "branch-2" }) }),
      );
      expect(prisma.__tx.studentDocument.create).not.toHaveBeenCalled();
    });
  });

  describe("getDownloadUrl / remove", () => {
    it("404s fetching a download URL for a document outside the tenant/owner scope", async () => {
      prisma.studentDocument.findFirst.mockResolvedValueOnce(null);
      await expect(service.getDownloadUrl("tenant-1", "student", "student-1", "doc-x")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("resolves a signed download URL for an owned document", async () => {
      prisma.studentDocument.findFirst.mockResolvedValueOnce({ id: "doc-1", storageKey: "doc-1.pdf", branchId: "branch-1" });
      storage.createDownloadUrl.mockResolvedValueOnce({ url: "http://x/doc-1.pdf", expires_at: "now" });

      const result = await service.getDownloadUrl("tenant-1", "student", "student-1", "doc-1");

      expect(storage.createDownloadUrl).toHaveBeenCalledWith("doc-1.pdf");
      expect(result.url).toBe("http://x/doc-1.pdf");
    });

    it("soft-deletes the row and best-effort deletes the storage object", async () => {
      prisma.studentDocument.findFirst.mockResolvedValueOnce({
        id: "doc-1",
        storageKey: "doc-1.pdf",
        branchId: "branch-1",
        label: "Birth Certificate",
        fileName: "cert.pdf",
      });

      await service.remove("tenant-1", "user-1", "student", "student-1", "doc-1");

      expect(prisma.__tx.studentDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "doc-1" }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
      expect(storage.deleteObject).toHaveBeenCalledWith("doc-1.pdf");
      expect(audit.record).toHaveBeenCalled();
    });
  });
});
