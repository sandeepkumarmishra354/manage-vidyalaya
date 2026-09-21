import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { VendorAdminJwtPayload } from "./jwt.strategy.js";

export const CurrentVendorAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext): VendorAdminJwtPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as VendorAdminJwtPayload;
});
