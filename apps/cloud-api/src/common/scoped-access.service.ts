import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
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
  constructor(private readonly prisma: PrismaService) {}

  async hasPermission(userId: string, permissionKey: PermissionKey): Promise<boolean> {
    const roleIds = (
      await this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } })
    ).map((ur) => ur.roleId);

    if (roleIds.length === 0) return false;

    const grant = await this.prisma.rolePermission.findFirst({
      where: { roleId: { in: roleIds }, permissionKey, deletedAt: null },
    });

    return grant !== null;
  }

  async getActingStaff(tenantId: string, userId: string) {
    return this.prisma.staff.findFirst({ where: { tenantId, userId, deletedAt: null } });
  }

  async isClassTeacherOfSection(staffId: string, sectionId: string): Promise<boolean> {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, classTeacherStaffId: staffId, deletedAt: null },
    });
    return section !== null;
  }

  // A TeacherSubjectAssignment with sectionId: null means "any section" per
  // its existing documented convention.
  async isAssignedToSubject(
    staffId: string,
    classId: string,
    subjectId: string,
    academicSessionId: string,
    sectionId: string | null,
  ): Promise<boolean> {
    const assignment = await this.prisma.teacherSubjectAssignment.findFirst({
      where: {
        staffId,
        classId,
        subjectId,
        academicSessionId,
        deletedAt: null,
        OR: [{ sectionId: null }, ...(sectionId ? [{ sectionId }] : [])],
      },
    });
    return assignment !== null;
  }
}
