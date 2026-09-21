import { useEffect, useMemo, useState } from "react";

import { api, type PermissionCatalogEntry, type Role } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function PermissionMatrix({ role }: { role: Role }) {
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.listPermissionCatalog().then(setCatalog);
  }, []);

  useEffect(() => {
    api.listRolePermissions(role.id).then((keys) => setGranted(new Set(keys)));
  }, [role.id]);

  const grouped = useMemo(() => {
    const groups = new Map<string, PermissionCatalogEntry[]>();
    for (const entry of catalog) {
      const module = entry.key.split(".")[0];
      groups.set(module, [...(groups.get(module) ?? []), entry]);
    }
    return groups;
  }, [catalog]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Permissions for "{role.name}"</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
        {[...grouped.entries()].map(([module, entries]) => (
          <div key={module} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{module.replace("_", " ")}</p>
            {entries.map((entry) => (
              <label key={entry.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={granted.has(entry.key)} disabled className="size-4 rounded border-input" />
                {entry.label}
              </label>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  useEffect(() => {
    api.listRoles().then((rs) => {
      setRoles(rs);
      if (!selectedRoleId && rs.length > 0) setSelectedRoleId(rs[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Roles &amp; Permissions</h1>
        <p className="text-muted-foreground">
          Roles are fixed by your plan and can't be created, renamed, or have their permissions edited. Select a role
          below to see what it can do.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {roles.map((role) => (
          <Badge
            key={role.id}
            variant={role.id === selectedRoleId ? "default" : "outline"}
            className="cursor-pointer px-3 py-1.5"
            onClick={() => setSelectedRoleId(role.id)}
          >
            {role.name}
            {role.is_system && " (system)"}
          </Badge>
        ))}
      </div>

      {selectedRole && <PermissionMatrix key={selectedRole.id} role={selectedRole} />}
    </div>
  );
}
