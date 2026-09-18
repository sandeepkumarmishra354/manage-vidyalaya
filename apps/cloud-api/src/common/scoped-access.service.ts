import { Injectable } from "@nestjs/common";

import { DbService } from "../db/db.service.js";
import type { PermissionKey } from "./permission-catalog.js";

// Shared authorization primitives used both by PermissionsGuard (flat
// permission-key checks) and by services that also need a narrower,
// relationship-based additive right on top of that -- e.g. a class teacher
// marking their own section's attendance without holding the broad
// attendance.mark permission, or a subject-assigned teacher entering marks
// for just their own subject without holding exams.enter_marks. These
// relationship checks live outside the flat permission-key model entirely.
@Injectable()
export class ScopedAccessService {
  constructor(private readonly db: DbService) {}

  async hasPermission(tenantId: string, userId: string, permissionKey: PermissionKey): Promise<boolean> {
    return this.db.withTransaction(tenantId, async (client) => {
      const roleRows = await client.query<{ role_id: string }>(
        "SELECT role_id FROM user_roles WHERE tenant_id = $1 AND user_id = $2",
        [tenantId, userId],
      );
      const roleIds = roleRows.rows.map((r) => r.role_id);
      if (roleIds.length === 0) return false;

      const grant = await client.query(
        "SELECT 1 FROM role_permissions WHERE tenant_id = $1 AND role_id = ANY($2) AND permission_key = $3 AND deleted_at IS NULL LIMIT 1",
        [tenantId, roleIds, permissionKey],
      );
      return grant.rows.length > 0;
    });
  }

  async getActingStaff(tenantId: string, userId: string) {
    return this.db.queryOne(
      tenantId,
      "SELECT * FROM staff WHERE tenant_id = $1 AND user_id = $2 AND deleted_at IS NULL",
      [tenantId, userId],
    );
  }

  async isClassTeacherOfSection(tenantId: string, staffId: string, sectionId: string): Promise<boolean> {
    const rows = await this.db.query(
      tenantId,
      "SELECT 1 FROM sections WHERE tenant_id = $1 AND id = $2 AND class_teacher_staff_id = $3 AND deleted_at IS NULL",
      [tenantId, sectionId, staffId],
    );
    return rows.length > 0;
  }

  // A TeacherSubjectAssignment with sectionId: null means "any section" per
  // its existing documented convention.
  async isAssignedToSubject(
    tenantId: string,
    staffId: string,
    classId: string,
    subjectId: string,
    academicSessionId: string,
    sectionId: string | null,
  ): Promise<boolean> {
    const rows = await this.db.query(
      tenantId,
      `SELECT 1 FROM teacher_subject_assignments
       WHERE tenant_id = $1 AND staff_id = $2 AND class_id = $3 AND subject_id = $4 AND academic_session_id = $5
         AND deleted_at IS NULL AND (section_id IS NULL OR section_id = $6)`,
      [tenantId, staffId, classId, subjectId, academicSessionId, sectionId],
    );
    return rows.length > 0;
  }
}
