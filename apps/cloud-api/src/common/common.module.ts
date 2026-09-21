import { Global, Module } from "@nestjs/common";

import { PlanLimitsService } from "./plan-limits.service.js";
import { ScopedAccessService } from "./scoped-access.service.js";

// Global so ScopedAccessService (used by PermissionsGuard everywhere, and
// directly by services needing additive relationship-based checks on top of
// the flat permission model -- see AttendanceService/ExamsService) doesn't
// need per-module wiring, matching PrismaModule's existing @Global pattern.
// PlanLimitsService (licensing/plan-tier checks, needed by AuthService,
// UsersService, StudentsService, StaffService, ModuleSettingsService, and
// the new self-service branch-creation endpoint) is global for the same
// reason.
@Global()
@Module({
  providers: [ScopedAccessService, PlanLimitsService],
  exports: [ScopedAccessService, PlanLimitsService],
})
export class CommonModule {}
