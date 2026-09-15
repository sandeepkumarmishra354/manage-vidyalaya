import { Global, Module } from "@nestjs/common";

import { ScopedAccessService } from "./scoped-access.service.js";

// Global so ScopedAccessService (used by PermissionsGuard everywhere, and
// directly by services needing additive relationship-based checks on top of
// the flat permission model -- see AttendanceService/ExamsService) doesn't
// need per-module wiring, matching PrismaModule's existing @Global pattern.
@Global()
@Module({
  providers: [ScopedAccessService],
  exports: [ScopedAccessService],
})
export class CommonModule {}
