import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import type { StorageService } from "../storage/storage.service.js";
import { DocumentsService } from "./documents.service.js";

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
}

function makeDbMock() {
  const client: FakeClient = { query: vi.fn() };
  const db = {
    withTransaction: vi.fn(async (_tenantId: string, fn: (client: FakeClient) => unknown) => fn(client)),
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn(),
  } as unknown as DbService & {
    query: ReturnType<typeof vi.fn>;
    queryOne: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  };
  return { db, client };
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
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let storage: ReturnType<typeof makeStorageMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: DocumentsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    storage = makeStorageMock();
    audit = makeAuditMock();
    service = new DocumentsService(db, storage, audit);
  });

  describe("requestUploadUrl", () => {
    it("404s when the owner doesn't exist in this tenant", async () => {
      db.queryOne.mockResolvedValueOnce(null);
      await expect(
        service.requestUploadUrl("tenant-1", "student", "student-1", { file_name: "a.pdf", content_type: "application/pdf" }, null),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.createUploadUrl).not.toHaveBeenCalled();
    });

    it("generates a storage key preserving the file extension", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "student-1", branch_id: "branch-1" });
      storage.createUploadUrl.mockResolvedValueOnce({ url: "http://x", method: "PUT", expires_at: "now" });

      const result = await service.requestUploadUrl(
        "tenant-1",
        "student",
        "student-1",
        {
          file_name: "report.pdf",
          content_type: "application/pdf",
        },
        null,
      );

      expect(storage.createUploadUrl).toHaveBeenCalledWith(expect.stringMatching(/^doc-.+\.pdf$/), "application/pdf");
      expect(result.storage_key).toMatch(/^doc-.+\.pdf$/);
    });
  });

  describe("create", () => {
    it("creates a student_documents row scoped to the owner's branch and records an audit entry", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "student-1", branch_id: "branch-1" });
      client.query.mockResolvedValueOnce({
        rows: [
          {
            id: "doc-1",
            tenant_id: "tenant-1",
            student_id: "student-1",
            branch_id: "branch-1",
            label: "Birth Certificate",
            file_name: "cert.pdf",
            mime_type: "application/pdf",
            file_size: 100,
            uploaded_by_user_id: "user-1",
            created_at: new Date(),
          },
        ],
      });

      await service.create(
        "tenant-1",
        "user-1",
        "student",
        "student-1",
        {
          label: "Birth Certificate",
          storage_key: "doc-1.pdf",
          file_name: "cert.pdf",
          mime_type: "application/pdf",
          file_size: 100,
        },
        null,
      );

      const [text, params] = client.query.mock.calls[0];
      expect(text).toMatch(/INSERT INTO student_documents/);
      expect(params).toContain("student-1");
      expect(params).toContain("branch-1");
      expect(audit.record).toHaveBeenCalled();
    });

    it("creates a staff_documents row when ownerType is staff", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "staff-1", branch_id: "branch-2" });
      client.query.mockResolvedValueOnce({
        rows: [
          {
            id: "doc-2",
            tenant_id: "tenant-1",
            staff_id: "staff-1",
            branch_id: "branch-2",
            label: "Resume",
            file_name: "resume.pdf",
            mime_type: "application/pdf",
            file_size: 50,
            uploaded_by_user_id: "user-1",
            created_at: new Date(),
          },
        ],
      });

      await service.create(
        "tenant-1",
        "user-1",
        "staff",
        "staff-1",
        {
          label: "Resume",
          storage_key: "doc-2.pdf",
          file_name: "resume.pdf",
          mime_type: "application/pdf",
          file_size: 50,
        },
        null,
      );

      const [text, params] = client.query.mock.calls[0];
      expect(text).toMatch(/INSERT INTO staff_documents/);
      expect(params).toContain("staff-1");
    });
  });

  describe("getDownloadUrl / remove", () => {
    it("404s fetching a download URL for a document outside the tenant/owner scope", async () => {
      db.queryOne.mockResolvedValueOnce(null);
      await expect(service.getDownloadUrl("tenant-1", "student", "student-1", "doc-x", null)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("resolves a signed download URL for an owned document", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "doc-1", storage_key: "doc-1.pdf", branch_id: "branch-1" });
      storage.createDownloadUrl.mockResolvedValueOnce({ url: "http://x/doc-1.pdf", expires_at: "now" });

      const result = await service.getDownloadUrl("tenant-1", "student", "student-1", "doc-1", null);

      expect(storage.createDownloadUrl).toHaveBeenCalledWith("doc-1.pdf");
      expect(result.url).toBe("http://x/doc-1.pdf");
    });

    it("soft-deletes the row and best-effort deletes the storage object", async () => {
      db.queryOne.mockResolvedValueOnce({
        id: "doc-1",
        storage_key: "doc-1.pdf",
        branch_id: "branch-1",
        label: "Birth Certificate",
        file_name: "cert.pdf",
      });
      client.query.mockResolvedValueOnce({ rows: [{ id: "doc-1", tenant_id: "tenant-1" }] });

      await service.remove("tenant-1", "user-1", "student", "student-1", "doc-1", null);

      const [text] = client.query.mock.calls[0];
      expect(text).toMatch(/UPDATE student_documents SET/);
      expect(storage.deleteObject).toHaveBeenCalledWith("doc-1.pdf");
      expect(audit.record).toHaveBeenCalled();
    });
  });

  // Phase 2: branch isolation. Both the parent owner (students/staff) and
  // the document tables themselves (student_documents/staff_documents)
  // carry branch_id, so resolveOwner (list/create/upload-url) and findOwned
  // (download/remove) each fold a branch_id condition into their SQL when
  // the caller is branch-scoped, reading as "not found" for anything
  // outside it. An unscoped caller is unaffected.
  describe("branch isolation", () => {
    it("list: folds a branch_id condition into the owner lookup when branch-scoped", async () => {
      db.queryOne.mockResolvedValueOnce(null); // owner filtered out by branch

      await expect(service.list("tenant-1", "student", "student-1", "branch-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );

      const [, sql, params] = db.queryOne.mock.calls[0];
      expect(sql).toContain("branch_id = $3");
      expect(params).toEqual(["student-1", "tenant-1", "branch-1"]);
    });

    it("list: adds no branch_id condition for an unscoped caller", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "student-1", branch_id: "branch-2" });
      db.query.mockResolvedValueOnce([]);

      await service.list("tenant-1", "student", "student-1", null);

      const [, sql, params] = db.queryOne.mock.calls[0];
      expect(sql).not.toContain("AND branch_id");
      expect(params).toEqual(["student-1", "tenant-1"]);
    });

    it("getDownloadUrl: folds a branch_id condition into the document lookup when branch-scoped", async () => {
      db.queryOne.mockResolvedValueOnce(null); // document filtered out by branch

      await expect(
        service.getDownloadUrl("tenant-1", "student", "student-1", "doc-1", "branch-1"),
      ).rejects.toBeInstanceOf(NotFoundException);

      const [, sql, params] = db.queryOne.mock.calls[0];
      expect(sql).toContain("branch_id = $4");
      expect(params).toEqual(["doc-1", "student-1", "tenant-1", "branch-1"]);
    });

    it("getDownloadUrl: succeeds for a document in the caller's own branch", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "doc-1", storage_key: "doc-1.pdf", branch_id: "branch-1" });
      storage.createDownloadUrl.mockResolvedValueOnce({ url: "http://x/doc-1.pdf", expires_at: "now" });

      const result = await service.getDownloadUrl("tenant-1", "student", "student-1", "doc-1", "branch-1");

      expect(result.url).toBe("http://x/doc-1.pdf");
    });

    it("remove: folds a branch_id condition into both the lookup and the soft-delete UPDATE", async () => {
      db.queryOne.mockResolvedValueOnce({
        id: "doc-1",
        storage_key: "doc-1.pdf",
        branch_id: "branch-1",
        label: "Birth Certificate",
        file_name: "cert.pdf",
      });
      client.query.mockResolvedValueOnce({ rows: [{ id: "doc-1", tenant_id: "tenant-1" }] });

      await service.remove("tenant-1", "user-1", "student", "student-1", "doc-1", "branch-1");

      const [, findSql, findParams] = db.queryOne.mock.calls[0];
      expect(findSql).toContain("branch_id = $4");
      expect(findParams).toEqual(["doc-1", "student-1", "tenant-1", "branch-1"]);

      const [updateSql, updateParams] = client.query.mock.calls[0];
      expect(updateSql).toContain("branch_id = $");
      expect(updateParams).toContain("branch-1");
    });
  });
});
