import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import type { StorageService } from "../storage/storage.service.js";
import { StaffService } from "./staff.service.js";

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

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

function makeStorageMock() {
  return {
    createUploadUrl: vi.fn(),
    createDownloadUrl: vi.fn(),
    deleteObject: vi.fn(),
  } as unknown as StorageService;
}

function uniqueViolationError() {
  const err = new Error('duplicate key value violates unique constraint "staff_tenant_id_employee_code_key"') as Error & {
    code: string;
  };
  err.code = "23505";
  return err;
}

const baseUpdateStaffDto = {
  branch_id: "branch-1",
  employee_code: "EMP-0001",
  first_name: "Asha",
  designation: "Teacher",
  employment_type: "full_time",
  date_of_joining: "2020-01-01",
};

const baseCreateStaffDto = {
  branch_id: "branch-1",
  first_name: "Asha",
  designation: "Teacher",
  employment_type: "full_time",
  date_of_joining: "2020-01-01",
  consent_given: true,
};

describe("StaffService.setClassTeacher", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StaffService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new StaffService(db, audit, new QrTokenService(), makeStorageMock());
  });

  it("rejects assigning a staff member who is already class teacher of a different section", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "section-other", class_name: "Class 8", name: "B" }] });

    await expect(
      service.setClassTeacher("tenant-1", "actor-1", "section-a", { staff_id: "staff-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("allows assigning a staff member with no conflicting section", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] }) // conflict check
      .mockResolvedValueOnce({ rows: [{ id: "section-a", class_teacher_staff_id: "staff-1", tenant_id: "tenant-1" }] }); // updateRow

    const result = await service.setClassTeacher("tenant-1", "actor-1", "section-a", { staff_id: "staff-1" });

    expect(result).toEqual({ id: "section-a", class_teacher_staff_id: "staff-1", tenant_id: "tenant-1" });
    expect(audit.record).toHaveBeenCalled();
  });

  it("does not conflict-check when clearing the class teacher (staff_id null)", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "section-a", class_teacher_staff_id: null, tenant_id: "tenant-1" }] });

    await service.setClassTeacher("tenant-1", "actor-1", "section-a", { staff_id: null });

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toContain("UPDATE sections");
  });

  it("excludes the section being updated from the conflict check, scoped to the tenant", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "section-a", class_teacher_staff_id: "staff-1", tenant_id: "tenant-1" }] });

    await service.setClassTeacher("tenant-1", "actor-1", "section-a", { staff_id: "staff-1" });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("s.tenant_id = $1");
    expect(sql).toContain("s.id != $3");
    expect(params).toEqual(["tenant-1", "staff-1", "section-a"]);
  });
});

describe("StaffService.updateStaff", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StaffService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new StaffService(db, audit, new QrTokenService(), makeStorageMock());
    client.query.mockResolvedValue({ rows: [{ id: "staff-1", tenant_id: "tenant-1" }] });
  });

  it("clears any other principal in the same branch when is_principal is set", async () => {
    await service.updateStaff("tenant-1", "actor-1", "staff-1", { ...baseUpdateStaffDto, is_principal: true });

    expect(client.query).toHaveBeenCalledTimes(2);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("UPDATE staff SET is_principal = false");
    expect(params).toEqual([expect.any(Date), "actor-1", "tenant-1", "branch-1", "staff-1"]);
  });

  it("does not touch other staff's principal flag when is_principal is omitted", async () => {
    await service.updateStaff("tenant-1", "actor-1", "staff-1", baseUpdateStaffDto);

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toContain("UPDATE staff");
  });

  it("writes the provided signature_url", async () => {
    await service.updateStaff("tenant-1", "actor-1", "staff-1", {
      ...baseUpdateStaffDto,
      signature_url: "data:image/png;base64,abc",
    });

    const [, params] = client.query.mock.calls[0];
    expect(params).toContain("data:image/png;base64,abc");
  });
});

describe("StaffService.createStaff", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StaffService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new StaffService(db, audit, new QrTokenService(), makeStorageMock());
    client.query.mockResolvedValue({ rows: [{ id: "staff-1", employee_code: "MAIN-0001" }] });
  });

  it("uses the supplied employee_code as-is without touching branch/count", async () => {
    await service.createStaff("tenant-1", "actor-1", { ...baseCreateStaffDto, employee_code: "CUSTOM-1" });

    expect(db.queryOne).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    const [, params] = client.query.mock.calls[0];
    expect(params).toContain("CUSTOM-1");
  });

  it("auto-generates {branch code}-{count+1} when employee_code is blank", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "branch-1", code: "MAIN" });
    db.query.mockResolvedValueOnce([{ count: "7" }]);

    await service.createStaff("tenant-1", "actor-1", baseCreateStaffDto);

    const [, params] = client.query.mock.calls[0];
    expect(params).toContain("MAIN-0008");
  });

  it("retries with the next sequence number on a unique-constraint clash", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "branch-1", code: "MAIN" });
    db.query.mockResolvedValueOnce([{ count: "7" }]);
    client.query
      .mockRejectedValueOnce(uniqueViolationError())
      .mockResolvedValueOnce({ rows: [{ id: "staff-1", employee_code: "MAIN-0009" }] });

    const result = await service.createStaff("tenant-1", "actor-1", baseCreateStaffDto);

    expect(result).toEqual({ id: "staff-1", employee_code: "MAIN-0009" });
    expect(client.query.mock.calls[0][1]).toContain("MAIN-0008");
    expect(client.query.mock.calls[1][1]).toContain("MAIN-0009");
  });

  it("404s when the target branch doesn't exist in this tenant", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await expect(service.createStaff("tenant-1", "actor-1", baseCreateStaffDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects without consent_given, before touching the database", async () => {
    await expect(
      service.createStaff("tenant-1", "actor-1", { ...baseCreateStaffDto, consent_given: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.queryOne).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe("StaffService.issueExperienceLetter", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: StaffService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new StaffService(db, makeAuditMock(), new QrTokenService(), makeStorageMock());
  });

  it("404s for a staff member outside the tenant", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.issueExperienceLetter("tenant-a", "user-1", "staff-1", {
        reason_for_leaving: "Resigned",
        date_of_leaving: "2026-04-01",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("generates a letter number and sets status to relieved on first issue", async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "staff-1",
            tenant_id: "tenant-a",
            branch_id: "branch-1",
            experience_letter_number: null,
            experience_letter_issue_date: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "staff-1", tenant_id: "tenant-a" }] });

    await service.issueExperienceLetter("tenant-a", "user-1", "staff-1", {
      reason_for_leaving: "Resigned",
      date_of_leaving: "2026-04-01",
    });

    const [, params] = client.query.mock.calls[1];
    expect(params).toContain("relieved");
    expect(params.some((p: unknown) => typeof p === "string" && /^EXP-BRAN-\d{8}-[0-9A-F]{4}$/.test(p))).toBe(true);
  });

  it("does not regenerate the letter number on a second issue", async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "staff-1",
            tenant_id: "tenant-a",
            branch_id: "branch-1",
            experience_letter_number: "EXP-BRAN-20260101-AAAA",
            experience_letter_issue_date: new Date("2026-01-01"),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "staff-1", tenant_id: "tenant-a" }] });

    await service.issueExperienceLetter("tenant-a", "user-1", "staff-1", {
      reason_for_leaving: "Resigned again",
      date_of_leaving: "2026-05-01",
    });

    const [, params] = client.query.mock.calls[1];
    expect(params).toContain("EXP-BRAN-20260101-AAAA");
    expect(
      (params as unknown[]).some((p) => p instanceof Date && p.getTime() === new Date("2026-01-01").getTime()),
    ).toBe(true);
  });
});

describe("StaffService.listStaff", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let service: StaffService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    service = new StaffService(db, makeAuditMock(), new QrTokenService(), makeStorageMock());
  });

  it("scopes to the tenant and branch with no extra filters when none are given", async () => {
    await service.listStaff("tenant-1", "branch-1");
    const [tenantId, sql, params] = db.query.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(sql).toContain("tenant_id = $1");
    expect(sql).toContain("branch_id = $2");
    expect(params).toEqual(["tenant-1", "branch-1"]);
  });

  it("combines category/department/status filters with AND", async () => {
    await service.listStaff("tenant-1", "branch-1", undefined, {
      categoryId: "cat-1",
      department: "Science",
      status: "active",
    });
    const [, sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("category_id = $3");
    expect(sql).toContain("department = $4");
    expect(sql).toContain("status = $5");
    expect(params).toEqual(["tenant-1", "branch-1", "cat-1", "Science", "active"]);
  });

  it("applies a case-insensitive search across name/code/designation", async () => {
    await service.listStaff("tenant-1", "branch-1", "asha");
    const [, sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("ILIKE");
    expect(params).toEqual(["tenant-1", "branch-1", "%asha%"]);
  });
});

describe("StaffService photo upload", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let storage: ReturnType<typeof makeStorageMock>;
  let service: StaffService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    storage = makeStorageMock();
    service = new StaffService(db, audit, new QrTokenService(), storage);
  });

  it("requests an upload url with a sanitized extension appended to a fresh key", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "staff-1", tenant_id: "tenant-1" });
    (storage.createUploadUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      url: "https://upload",
      method: "PUT",
      expires_at: "2026-01-01T00:00:00.000Z",
    });

    const result = await service.getPhotoUploadUrl("tenant-1", "staff-1", "photo.JPG", "image/jpeg");

    expect(result.storage_key).toMatch(/^photo-staff-.+\.jpg$/);
    expect(storage.createUploadUrl).toHaveBeenCalledWith(result.storage_key, "image/jpeg");
  });

  it("replacing a photo best-effort deletes the old object", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "staff-1", tenant_id: "tenant-1", branch_id: "branch-1", photo_path: "old-key" }] })
      .mockResolvedValueOnce({ rows: [{ id: "staff-1", tenant_id: "tenant-1" }] });

    await service.setPhoto("tenant-1", "actor-1", "staff-1", "new-key");

    expect(client.query.mock.calls[1][1]).toContain("new-key");
    expect(storage.deleteObject).toHaveBeenCalledWith("old-key");
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("getPhotoUrl returns null when no photo is set, without calling storage", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "staff-1", tenant_id: "tenant-1", photo_path: null });

    const result = await service.getPhotoUrl("tenant-1", "staff-1");

    expect(result).toEqual({ url: null });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });

  it("deletePhoto clears the field and deletes the object", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "staff-1", tenant_id: "tenant-1", branch_id: "branch-1", photo_path: "old-key" }] })
      .mockResolvedValueOnce({ rows: [{ id: "staff-1", tenant_id: "tenant-1" }] });

    await service.deletePhoto("tenant-1", "actor-1", "staff-1");

    expect(client.query.mock.calls[1][0]).toContain("UPDATE staff");
    expect(storage.deleteObject).toHaveBeenCalledWith("old-key");
  });

  it("deletePhoto is a no-op when no photo is set", async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: "staff-1", tenant_id: "tenant-1", branch_id: "branch-1", photo_path: null }],
    });

    await service.deletePhoto("tenant-1", "actor-1", "staff-1");

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("bulk photo urls only includes staff that actually have a photo set (query-level filter)", async () => {
    db.query.mockResolvedValueOnce([{ id: "staff-1", tenant_id: "tenant-1", photo_path: "key-1" }]);
    (storage.createDownloadUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      url: "https://download",
      expires_at: "2026-01-01T00:00:00.000Z",
    });

    const result = await service.getPhotoUrlsBulk("tenant-1", ["staff-1", "staff-2"]);

    const [, sql] = db.query.mock.calls[0];
    expect(sql).toContain("photo_path IS NOT NULL");
    expect(result).toEqual([{ staff_id: "staff-1", url: "https://download", expires_at: "2026-01-01T00:00:00.000Z" }]);
  });
});
