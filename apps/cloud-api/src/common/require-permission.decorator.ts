import { SetMetadata } from "@nestjs/common";

export const PERMISSION_KEY = "requiredPermission";

/// Marks a controller method as requiring the given permission key (see
/// apps/desktop/src-tauri/src/models.rs PERMISSION_CATALOG for the full
/// list -- kept in sync by hand). Read by PermissionsGuard, which must also
/// be applied (via @UseGuards) alongside JwtAuthGuard for this to do
/// anything -- it assumes `request.user` (a JwtPayload) is already set.
export const RequirePermission = (permissionKey: string) => SetMetadata(PERMISSION_KEY, permissionKey);
