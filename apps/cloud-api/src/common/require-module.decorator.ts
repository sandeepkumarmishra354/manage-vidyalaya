import { SetMetadata } from "@nestjs/common";

import type { ToggleableModule } from "./permission-catalog.js";

export const MODULE_KEY = "requiredModule";

/// Marks a controller (class-level, so every route in it is covered) as
/// requiring the given toggleable module to be eligible under the tenant's
/// plan tier and enabled for the acting branch. Read by ModuleAccessGuard,
/// which must also be applied (via @UseGuards) alongside JwtAuthGuard --
/// it assumes `request.user` (a JwtPayload) is already set.
export const RequireModule = (moduleKey: ToggleableModule) => SetMetadata(MODULE_KEY, moduleKey);
