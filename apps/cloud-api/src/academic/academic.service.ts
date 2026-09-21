import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";

import { AuditService } from "../audit/audit.service.js";
import { PlanLimitsService } from "../common/plan-limits.service.js";
import { DbService } from "../db/db.service.js";
import { isUniqueViolation } from "../db/pg-errors.js";
import { findManyForTenant, findOneForTenant, insertRow, updateRow } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";
import type { CreateAcademicSessionDto } from "./dto/create-academic-session.dto.js";
import type { CreateBranchDto } from "./dto/create-branch.dto.js";
import type { CreateClassDto } from "./dto/create-class.dto.js";
import type { CreateSectionDto } from "./dto/create-section.dto.js";
import type { UpdateAcademicSessionDto } from "./dto/update-academic-session.dto.js";
import type { UpdateBranchDto } from "./dto/update-branch.dto.js";
import type { UpdateClassDto } from "./dto/update-class.dto.js";
import type { UpdateSectionDto } from "./dto/update-section.dto.js";

export interface BranchRow extends TenantRow {
  name: string;
  print_template: string;
  print_paper_color: string;
}

export interface AcademicSessionRow extends TenantRow {
  name: string;
  is_current: boolean;
}

export interface ClassRow extends TenantRow {
  name: string;
  sort_order: number;
}

export interface SectionRow extends TenantRow {
  class_id: string;
  name: string;
}

@Injectable()
export class AcademicService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  listBranches(tenantId: string) {
    return this.db.withTransaction(tenantId, (client) =>
      findManyForTenant<BranchRow>(client, "branches", tenantId, {}, "name ASC"),
    );
  }

  // Self-service branch creation, capped by the tenant's plan (see
  // plan-catalog.ts's max_branches) -- there was previously no in-app way
  // to add a branch at all; only scripts/create-tenant.ts created the
  // first one, by hand.
  async createBranch(tenantId: string, actorUserId: string, dto: CreateBranchDto) {
    // Count + insert share one locked transaction (withTenantLock) rather
    // than two separate ones -- a plain count-then-insert across disjoint
    // transactions lets two concurrent requests both read the same
    // pre-insert count and both pass, exceeding max_branches.
    return this.db.withTenantLock(tenantId, "max_branches", async (client) => {
      const countResult = await client.query<{ count: string }>(
        "SELECT count(*) FROM branches WHERE tenant_id = $1 AND deleted_at IS NULL",
        [tenantId],
      );
      await this.planLimits.assertUnderLimit(
        tenantId,
        "max_branches",
        Number(countResult.rows[0]?.count ?? 0),
        "This school's plan allows at most that many branches.",
      );

      let branch: BranchRow;
      try {
        branch = await insertRow<BranchRow>(client, "branches", tenantId, {
          name: dto.name,
          code: dto.code,
          address: dto.address ?? null,
          city: dto.city ?? null,
          state: dto.state ?? null,
          pincode: dto.pincode ?? null,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          is_active: true,
          updated_at: new Date(),
          updated_by: actorUserId,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException("a branch with this code already exists");
        }
        throw error;
      }

      await this.audit.record(client, {
        tenantId,
        branchId: branch.id,
        actorUserId,
        entityTable: "branches",
        entityId: branch.id,
        action: "create",
        summary: `Created branch '${dto.name}'`,
      });

      return branch;
    });
  }

  async updateBranch(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateBranchDto,
    callerBranchId: string | null,
  ) {
    // `branches` rows have no branch_id column of their own -- a row IS a
    // branch -- so a branch-scoped caller's own branch is the id itself,
    // not something threaded into findOneForTenant. Same "not found" (not
    // "forbidden") semantics as everywhere else: a mismatch doesn't confirm
    // the id exists in another branch.
    if (callerBranchId && callerBranchId !== id) {
      throw new NotFoundException("branch not found");
    }

    return this.db.withTransaction(tenantId, async (client) => {
      const existing = await findOneForTenant<BranchRow>(client, "branches", tenantId, id);
      if (!existing) {
        throw new NotFoundException("branch not found");
      }

      const updated = await updateRow<BranchRow>(client, "branches", tenantId, id, {
        name: dto.name,
        address: dto.address ?? null,
        city: dto.city ?? null,
        state: dto.state ?? null,
        pincode: dto.pincode ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        logo_url: dto.logo_url ?? null,
        signature_url: dto.signature_url ?? null,
        print_template: dto.print_template ?? existing.print_template,
        print_paper_color: dto.print_paper_color ?? existing.print_paper_color,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: id,
        actorUserId,
        entityTable: "branches",
        entityId: id,
        action: "update",
        summary: `Updated school details for branch '${dto.name}'`,
      });

      return updated;
    });
  }

  listAcademicSessions(tenantId: string) {
    return this.db.withTransaction(tenantId, (client) =>
      findManyForTenant<AcademicSessionRow>(client, "academic_sessions", tenantId, {}, "start_date DESC"),
    );
  }

  async createAcademicSession(tenantId: string, actorUserId: string, dto: CreateAcademicSessionDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      if (dto.is_current) {
        await this.demoteOtherSessions(client, tenantId, now);
      }

      const session = await insertRow<AcademicSessionRow>(client, "academic_sessions", tenantId, {
        name: dto.name,
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
        is_current: dto.is_current,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "academic_sessions",
        entityId: session.id,
        action: "create",
        summary: `Created academic session '${dto.name}'`,
      });

      return session;
    });
  }

  async updateAcademicSession(tenantId: string, actorUserId: string, id: string, dto: UpdateAcademicSessionDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      if (dto.is_current) {
        await this.demoteOtherSessions(client, tenantId, now);
      }

      const session = await updateRow<AcademicSessionRow>(client, "academic_sessions", tenantId, id, {
        name: dto.name,
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
        is_current: dto.is_current,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "academic_sessions",
        entityId: id,
        action: "update",
        summary: "Updated academic session",
      });

      return session;
    });
  }

  // If the new/updated session is current, every other session for the
  // tenant is demoted first so exactly one session is ever current at a
  // time (mirrors the old demote_other_sessions in commands/branches.rs).
  private async demoteOtherSessions(client: PoolClient, tenantId: string, now: Date) {
    await client.query(
      "UPDATE academic_sessions SET is_current = false, updated_at = $1 WHERE tenant_id = $2 AND is_current = true",
      [now, tenantId],
    );
  }

  listClasses(tenantId: string, branchId: string) {
    return this.db.withTransaction(tenantId, (client) =>
      findManyForTenant<ClassRow>(client, "classes", tenantId, { branch_id: branchId }, "sort_order ASC"),
    );
  }

  async createClass(tenantId: string, actorUserId: string, dto: CreateClassDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const created = await insertRow<ClassRow>(client, "classes", tenantId, {
        branch_id: dto.branch_id,
        academic_session_id: dto.academic_session_id,
        name: dto.name,
        sort_order: dto.sort_order ?? 0,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        branchId: dto.branch_id,
        actorUserId,
        entityTable: "classes",
        entityId: created.id,
        action: "create",
        summary: `Created class '${dto.name}'`,
      });

      return created;
    });
  }

  async updateClass(tenantId: string, actorUserId: string, id: string, dto: UpdateClassDto, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<ClassRow>(
        client,
        "classes",
        tenantId,
        id,
        {
          name: dto.name,
          sort_order: dto.sort_order,
          updated_at: new Date(),
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "classes",
        entityId: id,
        action: "update",
        summary: `Renamed class to '${dto.name}'`,
      });

      return updated;
    });
  }

  async deleteClass(tenantId: string, actorUserId: string, id: string, branchId?: string | null) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      const deleted = await updateRow<ClassRow>(
        client,
        "classes",
        tenantId,
        id,
        {
          deleted_at: now,
          updated_at: now,
          updated_by: actorUserId,
        },
        branchId,
      );

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "classes",
        entityId: id,
        action: "delete",
        summary: "Deleted class",
      });

      return deleted;
    });
  }

  listSections(tenantId: string, classId: string) {
    return this.db.withTransaction(tenantId, (client) =>
      findManyForTenant<SectionRow>(client, "sections", tenantId, { class_id: classId }, "name ASC"),
    );
  }

  async createSection(tenantId: string, actorUserId: string, dto: CreateSectionDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const created = await insertRow<SectionRow>(client, "sections", tenantId, {
        class_id: dto.class_id,
        name: dto.name,
        capacity: dto.capacity ?? null,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "sections",
        entityId: created.id,
        action: "create",
        summary: `Created section '${dto.name}'`,
      });

      return created;
    });
  }

  async updateSection(tenantId: string, actorUserId: string, id: string, dto: UpdateSectionDto) {
    return this.db.withTransaction(tenantId, async (client) => {
      const updated = await updateRow<SectionRow>(client, "sections", tenantId, id, {
        name: dto.name,
        capacity: dto.capacity ?? null,
        updated_at: new Date(),
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "sections",
        entityId: id,
        action: "update",
        summary: `Renamed section to '${dto.name}'`,
      });

      return updated;
    });
  }

  async deleteSection(tenantId: string, actorUserId: string, id: string) {
    return this.db.withTransaction(tenantId, async (client) => {
      const now = new Date();
      const deleted = await updateRow<SectionRow>(client, "sections", tenantId, id, {
        deleted_at: now,
        updated_at: now,
        updated_by: actorUserId,
      });

      await this.audit.record(client, {
        tenantId,
        actorUserId,
        entityTable: "sections",
        entityId: id,
        action: "delete",
        summary: "Deleted section",
      });

      return deleted;
    });
  }
}
