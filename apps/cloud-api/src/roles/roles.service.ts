import { Injectable } from "@nestjs/common";

import { DbService } from "../db/db.service.js";
import { findManyForTenant } from "../db/tenant-repo.js";
import type { TenantRow } from "../db/tenant-repo.js";

export interface RoleRow extends TenantRow {
  name: string;
  is_system: boolean;
}

@Injectable()
export class RolesService {
  constructor(private readonly db: DbService) {}

  listRoles(tenantId: string) {
    return this.db.withTransaction(tenantId, (client) =>
      findManyForTenant<RoleRow>(client, "roles", tenantId, {}, "name ASC"),
    );
  }

  async listRolePermissions(tenantId: string, roleId: string) {
    const grants = await this.db.query<{ permission_key: string }>(
      tenantId,
      "SELECT permission_key FROM role_permissions WHERE tenant_id = $1 AND role_id = $2 AND deleted_at IS NULL",
      [tenantId, roleId],
    );
    return grants.map((g) => g.permission_key);
  }
}
