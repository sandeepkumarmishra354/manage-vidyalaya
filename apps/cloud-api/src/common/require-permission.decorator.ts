import { SetMetadata } from "@nestjs/common";

import type { PermissionKey } from "./permission-catalog.js";

export const PERMISSION_KEY = "requiredPermission";

/// Marks a controller method as requiring the given permission key (see
/// ./permission-catalog.ts PERMISSION_CATALOG for the full list). Read by
/// PermissionsGuard, which must also be applied (via @UseGuards) alongside
/// JwtAuthGuard for this to do anything -- it assumes `request.user` (a
/// JwtPayload) is already set.
export const RequirePermission = (permissionKey: PermissionKey) => SetMetadata(PERMISSION_KEY, permissionKey);
