import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { JwtPayload } from "../auth/jwt.strategy.js";
import type { PermissionKey } from "./permission-catalog.js";
import { PERMISSION_KEY } from "./require-permission.decorator.js";
import { ScopedAccessService } from "./scoped-access.service.js";

/// Must run after JwtAuthGuard (so `request.user` is populated). Checks
/// fresh against the database rather than trusting the JWT's `roles` array,
/// since role/permission assignments can change after a token was issued
/// without the holder re-logging-in.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly scopedAccess: ScopedAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<PermissionKey | undefined>(PERMISSION_KEY, context.getHandler());
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    if (!user) {
      throw new ForbiddenException("not authorized");
    }

    if (!(await this.scopedAccess.hasPermission(user.sub, requiredPermission))) {
      throw new ForbiddenException(`missing permission: ${requiredPermission}`);
    }

    return true;
  }
}
