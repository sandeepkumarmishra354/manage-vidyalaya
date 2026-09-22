import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanLimitsService } from "../common/plan-limits.service.js";
import { JwtStrategy, type JwtPayload } from "./jwt.strategy.js";

const ACCESS_PAYLOAD: JwtPayload = {
  sub: "user-1",
  tenant_id: "tenant-1",
  branch_id: "branch-1",
  roles: ["teacher"],
  type: "access",
};

describe("JwtStrategy", () => {
  let planLimits: { assertTenantActive: ReturnType<typeof vi.fn> };
  let config: ConfigService;
  let strategy: JwtStrategy;

  beforeEach(() => {
    planLimits = { assertTenantActive: vi.fn().mockResolvedValue(undefined) };
    config = { get: vi.fn().mockReturnValue("dev-only-change-me") } as unknown as ConfigService;
    strategy = new JwtStrategy(config, planLimits as unknown as PlanLimitsService);
  });

  it("rejects a refresh token presented as a bearer access token, without checking tenant state", async () => {
    await expect(strategy.validate({ ...ACCESS_PAYLOAD, type: "refresh" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(planLimits.assertTenantActive).not.toHaveBeenCalled();
  });

  it("re-checks the tenant's live state on every request, not just login/refresh", async () => {
    const result = await strategy.validate(ACCESS_PAYLOAD);
    expect(result).toEqual(ACCESS_PAYLOAD);
    expect(planLimits.assertTenantActive).toHaveBeenCalledWith("tenant-1");
  });

  it("rejects an access token belonging to a tenant that was suspended/expired after the token was issued", async () => {
    planLimits.assertTenantActive.mockRejectedValueOnce(
      new UnauthorizedException("Your school's account has been suspended. Contact your administrator."),
    );

    await expect(strategy.validate(ACCESS_PAYLOAD)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
