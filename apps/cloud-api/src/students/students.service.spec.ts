import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { DbService } from "../db/db.service.js";
import type { FeesService } from "../fees/fees.service.js";
import { QrTokenService } from "../qr/qr-token.service.js";
import type { StorageService } from "../storage/storage.service.js";
import type { UpdateStudentDto } from "./dto/update-student.dto.js";
import { StudentsService } from "./students.service.js";

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
}

function makeDbMock() {
  const client: FakeClient = { query: vi.fn() };
  const db = {
    withTransaction: vi.fn(async (_tenantId: string, fn: (client: FakeClient) => unknown) => fn(client)),
    query: vi.fn(),
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

function makePlanLimitsMock() {
  return { assertUnderLimit: vi.fn().mockResolvedValue(undefined) };
}

function makeStorageMock() {
  return {
    createUploadUrl: vi.fn(),
    createDownloadUrl: vi.fn(),
    deleteObject: vi.fn(),
  } as unknown as StorageService;
}

// resolveCurrentSessionId rejects by default -- confirmAdmission's fee
// generation is best-effort and swallows exactly that case, so these tests
// exercise the admission-number logic without needing to also mock the
// full fee-generation path.
function makeFeesMock() {
  return {
    resolveCurrentSessionId: vi.fn().mockRejectedValue(new BadRequestException("no current session")),
    listMatchingStructures: vi.fn().mockResolvedValue([]),
    generateInvoiceForStudent: vi.fn(),
  } as unknown as FeesService;
}


function uniqueViolationError() {
  const err = new Error('duplicate key value violates unique constraint "students_tenant_id_admission_number_key"') as Error & {
    code: string;
  };
  err.code = "23505";
  return err;
}

// Configures client.query to resolve immediately (no-op) for SAVEPOINT
// control statements, and to cycle through `outcomes` in order for every
// other (real) query -- matching confirmAdmission's SAVEPOINT-per-attempt
// retry loop.
function scriptClientQueries(client: FakeClient, outcomes: Array<"ok" | "conflict">) {
  let i = 0;
  client.query.mockImplementation(async (text: unknown) => {
    if (typeof text === "string" && /^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/.test(text)) {
      return { rows: [] };
    }
    const outcome = outcomes[i++];
    if (outcome === "conflict") {
      throw uniqueViolationError();
    }
    return { rows: [{ id: "row-1", tenant_id: "tenant-a" }] };
  });
}

describe("StudentsService.confirmAdmission", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StudentsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new StudentsService(
      db,
      audit,
      makeFeesMock(),
      new QrTokenService(),
      makeStorageMock(), makePlanLimitsMock() as any);
  });

  function mockAdmissionAndBranch() {
    db.queryOne
      .mockResolvedValueOnce({
        id: "admission-1",
        tenant_id: "tenant-a",
        student_id: "student-1",
        branch_id: "branch-1",
        deleted_at: null,
      })
      .mockResolvedValueOnce({ code: "MAIN" });
  }

  it("throws NotFoundException when the admission doesn't exist", async () => {
    db.queryOne.mockResolvedValueOnce(null);

    await expect(service.confirmAdmission("tenant-a", "actor-1", "missing", null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("assigns branch+year-scoped sequential number 0001 when no prior students exist", async () => {
    mockAdmissionAndBranch();
    db.query.mockResolvedValueOnce([{ count: "5" }]); // enrolled-student headcount check
    db.query.mockResolvedValueOnce([{ count: "0" }]); // admission-number sequence count
    db.queryOne.mockResolvedValueOnce({ id: "student-1", current_class_id: null });
    scriptClientQueries(client, ["ok", "ok"]);

    const result = await service.confirmAdmission("tenant-a", "actor-1", "admission-1", null);

    const year = new Date().getUTCFullYear();
    expect(result.admission_number).toBe(`MAIN-${year}-0001`);
    expect(result.stage).toBe("enrolled");
  });

  it("continues the sequence from the existing count", async () => {
    mockAdmissionAndBranch();
    db.query.mockResolvedValueOnce([{ count: "5" }]); // enrolled-student headcount check
    db.query.mockResolvedValueOnce([{ count: "41" }]); // admission-number sequence count
    db.queryOne.mockResolvedValueOnce({ id: "student-1", current_class_id: null });
    scriptClientQueries(client, ["ok", "ok"]);

    const result = await service.confirmAdmission("tenant-a", "actor-1", "admission-1", null);

    const year = new Date().getUTCFullYear();
    expect(result.admission_number).toBe(`MAIN-${year}-0042`);
  });

  it("retries with the next sequence number on a unique-constraint clash (same-request race)", async () => {
    mockAdmissionAndBranch();
    db.query.mockResolvedValueOnce([{ count: "5" }]); // enrolled-student headcount check
    db.query.mockResolvedValueOnce([{ count: "0" }]); // admission-number sequence count
    db.queryOne.mockResolvedValueOnce({ id: "student-1", current_class_id: null });
    scriptClientQueries(client, ["conflict", "conflict", "ok", "ok"]);

    const result = await service.confirmAdmission("tenant-a", "actor-1", "admission-1", null);

    const year = new Date().getUTCFullYear();
    expect(result.admission_number).toBe(`MAIN-${year}-0003`);
  });

  it("propagates a non-unique-constraint error immediately without retrying", async () => {
    mockAdmissionAndBranch();
    db.query.mockResolvedValueOnce([{ count: "5" }]); // enrolled-student headcount check
    db.query.mockResolvedValueOnce([{ count: "0" }]); // admission-number sequence count
    const otherError = new Error("connection lost");
    client.query.mockImplementation(async (text: unknown) => {
      if (typeof text === "string" && /^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/.test(text)) {
        return { rows: [] };
      }
      throw otherError;
    });

    await expect(service.confirmAdmission("tenant-a", "actor-1", "admission-1", null)).rejects.toBe(otherError);
  });

  it("rejects once the plan's student limit is reached, before allocating an admission number", async () => {
    mockAdmissionAndBranch();
    const planLimits = makePlanLimitsMock();
    planLimits.assertUnderLimit.mockRejectedValueOnce(new Error("plan limit reached"));
    const limitedService = new StudentsService(db, audit, makeFeesMock(), new QrTokenService(), makeStorageMock(), planLimits as any);
    db.query.mockResolvedValueOnce([{ count: "2000" }]); // at the plan's limit

    await expect(limitedService.confirmAdmission("tenant-a", "actor-1", "admission-1", null)).rejects.toThrow(
      "plan limit reached",
    );
    expect(db.query).toHaveBeenCalledTimes(1); // never reaches the admission-number sequence query
  });
});

describe("StudentsService.electSubject", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StudentsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new StudentsService(
      db,
      audit,
      makeFeesMock(),
      new QrTokenService(),
      makeStorageMock(), makePlanLimitsMock() as any);
  });

  const dto = { elective_group_id: "group-1", subject_id: "subj-art", academic_session_id: "session-1" };

  it("throws NotFoundException when the student doesn't exist", async () => {
    client.query.mockResolvedValueOnce({ rows: [] }); // findOneForTenant: student

    await expect(service.electSubject("tenant-a", "actor-1", "missing", dto, null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects when the elective group belongs to a different class than the student's current class", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "student-1", branch_id: "branch-1", current_class_id: "class-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "group-1", class_id: "class-2" }] });

    await expect(service.electSubject("tenant-a", "actor-1", "student-1", dto, null)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("rejects when the chosen subject isn't a member of the elective group", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "student-1", branch_id: "branch-1", current_class_id: "class-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "group-1", class_id: "class-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(service.electSubject("tenant-a", "actor-1", "student-1", dto, null)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("records the choice when the subject is a valid member of the group", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "student-1", branch_id: "branch-1", current_class_id: "class-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "group-1", class_id: "class-1" }] })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: "choice-1" }] });

    const result = await service.electSubject("tenant-a", "actor-1", "student-1", dto, null);
    expect(result).toEqual({ id: "choice-1" });
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe("StudentsService.getGuardian", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let service: StudentsService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    service = new StudentsService(
      db,
      makeAuditMock(),
      makeFeesMock(),
      new QrTokenService(),
      makeStorageMock(), makePlanLimitsMock() as any);
  });

  it("throws when the guardian doesn't exist or is soft-deleted", async () => {
    db.queryOne.mockResolvedValueOnce(null);
    await expect(service.getGuardian("tenant-a", "guardian-1", null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns the guardian's profile plus every linked child, regardless of enrollment status", async () => {
    db.queryOne.mockResolvedValueOnce({
      id: "guardian-1",
      full_name: "Asha Rao",
      relation: "mother",
      phone: "9876500000",
      alt_phone: null,
      email: null,
      occupation: "Engineer",
      address: null,
      aadhaar_number: null,
      annual_income: null,
    });
    db.query.mockResolvedValueOnce([
      {
        id: "student-1",
        first_name: "Ravi",
        last_name: "Rao",
        admission_number: "ADM-0001",
        status: "enrolled",
        class_name: "Class 5",
        section_name: "A",
      },
      {
        id: "student-2",
        first_name: "Priya",
        last_name: "Rao",
        admission_number: null,
        status: "applied",
        class_name: null,
        section_name: null,
      },
    ]);

    const result = await service.getGuardian("tenant-a", "guardian-1", null);

    expect(result.full_name).toBe("Asha Rao");
    expect(result.children).toEqual([
      {
        id: "student-1",
        first_name: "Ravi",
        last_name: "Rao",
        admission_number: "ADM-0001",
        class_name: "Class 5",
        section_name: "A",
        status: "enrolled",
      },
      {
        id: "student-2",
        first_name: "Priya",
        last_name: "Rao",
        admission_number: null,
        class_name: null,
        section_name: null,
        status: "applied",
      },
    ]);
    expect(db.query).toHaveBeenCalledWith(
      "tenant-a",
      expect.stringContaining("sg.guardian_id = $2"),
      ["tenant-a", "guardian-1"],
    );
  });
});

describe("StudentsService.issueTransferCertificate", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: StudentsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    service = new StudentsService(
      db,
      audit,
      makeFeesMock(),
      new QrTokenService(),
      makeStorageMock(), makePlanLimitsMock() as any);
  });

  it("404s for a student outside the tenant", async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      service.issueTransferCertificate(
        "tenant-a",
        "user-1",
        "student-1",
        {
          reason_for_leaving: "Relocation",
          date_of_leaving: "2026-04-01",
        },
        null,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("generates a TC number and sets status to withdrawn on first issue", async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: "student-1", branch_id: "branch-1", status: "enrolled", tc_number: null, tc_issue_date: null }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "student-1", tc_number: "TC-BRAN-20260401-ABCD" }] });

    await service.issueTransferCertificate(
      "tenant-a",
      "user-1",
      "student-1",
      {
        reason_for_leaving: "Relocation",
        date_of_leaving: "2026-04-01",
      },
      null,
    );

    const [updateSql, updateParams] = client.query.mock.calls[1]!;
    expect(updateSql).toContain("UPDATE students");
    expect(updateParams).toContain("withdrawn");
    expect(updateParams.some((p: unknown) => typeof p === "string" && /^TC-BRAN-\d{8}-[0-9A-F]{4}$/.test(p))).toBe(
      true,
    );
  });

  it("does not regenerate the TC number on a second issue, and preserves alumni status", async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "student-1",
            branch_id: "branch-1",
            status: "alumni",
            tc_number: "TC-BRAN-20260101-AAAA",
            tc_issue_date: new Date("2026-01-01"),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "student-1" }] });

    await service.issueTransferCertificate(
      "tenant-a",
      "user-1",
      "student-1",
      {
        reason_for_leaving: "Graduated",
        date_of_leaving: "2026-04-01",
        conduct_remark: "Excellent",
      },
      null,
    );

    const [, updateParams] = client.query.mock.calls[1]!;
    expect(updateParams).toContain("alumni");
    expect(updateParams).toContain("TC-BRAN-20260101-AAAA");
  });
});

describe("StudentsService.listStudents", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let service: StudentsService;

  beforeEach(() => {
    ({ db } = makeDbMock());
    db.query.mockResolvedValue([]);
    service = new StudentsService(
      db,
      makeAuditMock(),
      makeFeesMock(),
      new QrTokenService(),
      makeStorageMock(), makePlanLimitsMock() as any);
  });

  it("scopes to tenant/branch with no extra filters when none are given", async () => {
    await service.listStudents("tenant-a", "branch-1");
    expect(db.query).toHaveBeenCalledWith(
      "tenant-a",
      expect.stringContaining("s.tenant_id = $1 AND s.branch_id = $2 AND s.deleted_at IS NULL"),
      ["tenant-a", "branch-1"],
    );
  });

  it("combines status/class/section/gender filters with AND", async () => {
    await service.listStudents("tenant-a", "branch-1", undefined, {
      status: "alumni",
      classId: "class-1",
      sectionId: "section-1",
      gender: "Female",
    });
    const [, sql, params] = db.query.mock.calls[0]!;
    expect(sql).toContain("s.status = $3");
    expect(sql).toContain("s.current_class_id = $4");
    expect(sql).toContain("s.current_section_id = $5");
    expect(sql).toContain("s.gender = $6");
    expect(params).toEqual(["tenant-a", "branch-1", "alumni", "class-1", "section-1", "Female"]);
  });

  it("leaves existing search behavior unchanged when no filter is set", async () => {
    await service.listStudents("tenant-a", "branch-1", "ravi");
    const [, sql, params] = db.query.mock.calls[0]!;
    expect(sql).toContain("ILIKE");
    expect(params).toEqual(["tenant-a", "branch-1", "%ravi%"]);
  });
});

describe("StudentsService photo upload", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let audit: ReturnType<typeof makeAuditMock>;
  let storage: ReturnType<typeof makeStorageMock>;
  let service: StudentsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    audit = makeAuditMock();
    storage = makeStorageMock();
    service = new StudentsService(db, audit, makeFeesMock(), new QrTokenService(), storage, makePlanLimitsMock() as any);
  });

  it("requests an upload url with a sanitized extension appended to a fresh key", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "student-1" });
    (storage.createUploadUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      url: "https://upload",
      method: "PUT",
      expires_at: "2026-01-01T00:00:00.000Z",
    });

    const result = await service.getPhotoUploadUrl("tenant-1", "student-1", "photo.PNG", "image/png", null);

    expect(result.storage_key).toMatch(/^photo-student-.+\.png$/);
    expect(storage.createUploadUrl).toHaveBeenCalledWith(result.storage_key, "image/png");
  });

  it("replacing a photo best-effort deletes the old object", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "student-1", branch_id: "branch-1", photo_path: "old-key" }] })
      .mockResolvedValueOnce({ rows: [{ id: "student-1", photo_path: "new-key" }] });

    await service.setPhoto("tenant-1", "actor-1", "student-1", "new-key", null);

    const [updateSql, updateParams] = client.query.mock.calls[1]!;
    expect(updateSql).toContain("UPDATE students");
    expect(updateParams).toContain("new-key");
    expect(storage.deleteObject).toHaveBeenCalledWith("old-key");
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("setting a photo for the first time doesn't attempt to delete anything", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "student-1", branch_id: "branch-1", photo_path: null }] })
      .mockResolvedValueOnce({ rows: [{ id: "student-1", photo_path: "new-key" }] });

    await service.setPhoto("tenant-1", "actor-1", "student-1", "new-key", null);

    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("getPhotoUrl returns null when no photo is set, without calling storage", async () => {
    db.queryOne.mockResolvedValueOnce({ id: "student-1", photo_path: null });

    const result = await service.getPhotoUrl("tenant-1", "student-1", null);

    expect(result).toEqual({ url: null });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });

  it("deletePhoto clears the field and deletes the object", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: "student-1", branch_id: "branch-1", photo_path: "old-key" }] })
      .mockResolvedValueOnce({ rows: [{ id: "student-1", photo_path: null }] });

    await service.deletePhoto("tenant-1", "actor-1", "student-1", null);

    const [updateSql] = client.query.mock.calls[1]!;
    expect(updateSql).toContain("UPDATE students");
    expect(storage.deleteObject).toHaveBeenCalledWith("old-key");
  });

  it("deletePhoto is a no-op when no photo is set", async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: "student-1", branch_id: "branch-1", photo_path: null }] });

    await service.deletePhoto("tenant-1", "actor-1", "student-1", null);

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("bulk photo urls only includes students that actually have a photo set (query-level filter)", async () => {
    db.query.mockResolvedValueOnce([{ id: "student-1", photo_path: "key-1" }]);
    (storage.createDownloadUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      url: "https://download",
      expires_at: "2026-01-01T00:00:00.000Z",
    });

    const result = await service.getPhotoUrlsBulk("tenant-1", ["student-1", "student-2"], null);

    expect(db.query).toHaveBeenCalledWith(
      "tenant-1",
      expect.stringContaining("photo_path IS NOT NULL"),
      ["tenant-1", ["student-1", "student-2"]],
    );
    expect(result).toEqual([{ student_id: "student-1", url: "https://download", expires_at: "2026-01-01T00:00:00.000Z" }]);
  });
});

// Phase 2: branch isolation for single-record by-id access. `students`
// carries its own branch_id, so every by-id lookup/update/delete below
// should fold a branch_id condition into its SQL when the caller is
// branch-scoped (branchId non-null), and read as "not found" when the row
// doesn't match -- never leak that it exists in another branch. An unscoped
// caller (branchId: null) is unaffected, matching today's behavior.
describe("StudentsService branch isolation", () => {
  let db: ReturnType<typeof makeDbMock>["db"];
  let client: FakeClient;
  let service: StudentsService;

  beforeEach(() => {
    ({ db, client } = makeDbMock());
    service = new StudentsService(
      db,
      makeAuditMock(),
      makeFeesMock(),
      new QrTokenService(),
      makeStorageMock(), makePlanLimitsMock() as any);
  });

  describe("getStudent", () => {
    it("folds a branch_id condition into the query when the caller is branch-scoped", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "student-1", branch_id: "branch-1" });
      db.query.mockResolvedValueOnce([]); // guardians

      await service.getStudent("tenant-a", "student-1", "branch-1");

      const [, sql, params] = db.queryOne.mock.calls[0];
      expect(sql).toContain("s.branch_id = $3");
      expect(params).toEqual(["tenant-a", "student-1", "branch-1"]);
    });

    it("404s (not leaking existence) when the row doesn't match the caller's branch", async () => {
      db.queryOne.mockResolvedValueOnce(null); // simulates a real DB filtering out a different-branch row

      await expect(service.getStudent("tenant-a", "student-1", "branch-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("succeeds for the caller's own-branch record", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "student-1", branch_id: "branch-1" });
      db.query.mockResolvedValueOnce([]); // guardians

      const result = await service.getStudent("tenant-a", "student-1", "branch-1");

      expect(result.id).toBe("student-1");
    });

    it("adds no branch_id condition for an unscoped caller (branchId: null)", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "student-1", branch_id: "branch-2" });
      db.query.mockResolvedValueOnce([]); // guardians

      await service.getStudent("tenant-a", "student-1", null);

      const [, sql, params] = db.queryOne.mock.calls[0];
      expect(sql).not.toContain("branch_id");
      expect(params).toEqual(["tenant-a", "student-1"]);
    });
  });

  describe("updateStudent", () => {
    const dto = { first_name: "Ravi" } as UpdateStudentDto;

    it("folds a branch_id condition into the UPDATE when the caller is branch-scoped", async () => {
      client.query.mockResolvedValueOnce({ rows: [{ id: "student-1", tenant_id: "tenant-a" }] });

      await service.updateStudent("tenant-a", "actor-1", "student-1", dto, "branch-1");

      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toContain("branch_id = $");
      expect(params).toContain("branch-1");
    });

    it("throws NotFoundException when the row is outside the caller's branch (updateRow finds no match)", async () => {
      client.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.updateStudent("tenant-a", "actor-1", "student-1", dto, "branch-1"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("succeeds without a branch_id condition for an unscoped caller", async () => {
      client.query.mockResolvedValueOnce({ rows: [{ id: "student-1", tenant_id: "tenant-a" }] });

      await service.updateStudent("tenant-a", "actor-1", "student-1", dto, null);

      const [sql] = client.query.mock.calls[0];
      expect(sql).not.toContain("branch_id");
    });
  });

  describe("deleteStudent", () => {
    it("folds a branch_id condition into the soft-delete UPDATE when branch-scoped", async () => {
      client.query.mockResolvedValueOnce({ rows: [{ id: "student-1", tenant_id: "tenant-a" }] });

      await service.deleteStudent("tenant-a", "actor-1", "student-1", "branch-1");

      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toContain("branch_id = $");
      expect(params).toContain("branch-1");
    });

    it("404s when the row is outside the caller's branch", async () => {
      client.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.deleteStudent("tenant-a", "actor-1", "student-1", "branch-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("succeeds without a branch_id condition for an unscoped caller", async () => {
      client.query.mockResolvedValueOnce({ rows: [{ id: "student-1", tenant_id: "tenant-a" }] });

      await service.deleteStudent("tenant-a", "actor-1", "student-1", null);

      const [sql] = client.query.mock.calls[0];
      expect(sql).not.toContain("branch_id");
    });
  });

  describe("getSiblings", () => {
    it("verifies the student belongs to the caller's branch before looking up siblings", async () => {
      client.query.mockResolvedValueOnce({ rows: [] }); // findOneForTenant: student not found in this branch

      await expect(service.getSiblings("tenant-a", "student-1", "branch-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("proceeds to look up siblings once the parent student is confirmed in-branch", async () => {
      client.query.mockResolvedValueOnce({ rows: [{ id: "student-1", tenant_id: "tenant-a", branch_id: "branch-1" }] });
      db.query.mockResolvedValueOnce([]); // no shared guardians

      const result = await service.getSiblings("tenant-a", "student-1", "branch-1");

      expect(result).toEqual([]);
    });
  });

  describe("getGuardian", () => {
    it("filters the children list to the caller's branch when branch-scoped", async () => {
      db.queryOne.mockResolvedValueOnce({ id: "guardian-1", full_name: "Asha Rao" });
      db.query.mockResolvedValueOnce([]);

      await service.getGuardian("tenant-a", "guardian-1", "branch-1");

      const [, sql, params] = db.query.mock.calls[0];
      expect(sql).toContain("s.branch_id = $3");
      expect(params).toEqual(["tenant-a", "guardian-1", "branch-1"]);
    });
  });
});
