import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { PrismaService } from "../prisma/prisma.service.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { PERMISSION_KEY } from "./require-permission.decorator.js";

/// Must run after JwtAuthGuard (so `request.user` is populated). Checks
/// fresh against the database rather than trusting the JWT's `roles` array,
/// since role/permission assignments can change after a token was issued
/// without the holder re-logging-in.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<string | undefined>(PERMISSION_KEY, context.getHandler());
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    if (!user) {
      throw new ForbiddenException("not authorized");
    }

    const roleIds = (
      await this.prisma.userRole.findMany({ where: { userId: user.sub }, select: { roleId: true } })
    ).map((ur) => ur.roleId);

    if (roleIds.length === 0) {
      throw new ForbiddenException(`missing permission: ${requiredPermission}`);
    }

    const grant = await this.prisma.rolePermission.findFirst({
      where: { roleId: { in: roleIds }, permissionKey: requiredPermission, deletedAt: null },
    });

    if (!grant) {
      throw new ForbiddenException(`missing permission: ${requiredPermission}`);
    }

    return true;
  }
}
