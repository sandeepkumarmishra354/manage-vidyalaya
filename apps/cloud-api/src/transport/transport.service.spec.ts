import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditService } from "../audit/audit.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { TransportService } from "./transport.service.js";

function makePrismaMock() {
  const tx = {
    studentTransport: { upsert: vi.fn().mockResolvedValue({ id: "assignment-1" }) },
  };
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    __tx: tx,
  } as unknown as PrismaService & { __tx: typeof tx };
}

function makeAuditMock() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe("TransportService.assignStudentTransport", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: TransportService;

  beforeEach(() => {
    prisma = makePrismaMock();
    audit = makeAuditMock();
    service = new TransportService(prisma, audit);
  });

  it("resets deletedAt on the update branch, so re-assigning after a soft-delete becomes visible again", async () => {
    await service.assignStudentTransport("tenant-1", "actor-1", {
      student_id: "student-1",
      route_id: "route-1",
      stop_id: "stop-1",
    });

    expect(prisma.__tx.studentTransport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: "student-1" },
        update: expect.objectContaining({ routeId: "route-1", stopId: "stop-1", deletedAt: null }),
      }),
    );
  });

  it("records an audit entry for the assignment", async () => {
    await service.assignStudentTransport("tenant-1", "actor-1", {
      student_id: "student-1",
      route_id: "route-1",
      stop_id: "stop-1",
    });

    expect(audit.record).toHaveBeenCalledWith(
      prisma.__tx,
      expect.objectContaining({
        tenantId: "tenant-1",
        actorUserId: "actor-1",
        entityTable: "student_transport",
        entityId: "assignment-1",
        action: "update",
      }),
    );
  });
});
