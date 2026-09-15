import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusIcon, TrashIcon } from "lucide-react";

import { api, type PermissionCatalogEntry, type Role } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function NewRoleDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.createRole({ name });
      setName("");
      setOpen(false);
      onCreated();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          New role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-name">Name</Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. librarian" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !name}>
              {isSubmitting ? "Creating..." : "Create role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PermissionMatrix({ role }: { role: Role }) {
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

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

  const toggle = (key: string) => {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.setRolePermissions({ role_id: role.id, permission_keys: [...granted] });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Permissions for "{role.name}"</CardTitle>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save permissions"}
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-3">
        {[...grouped.entries()].map(([module, entries]) => (
          <div key={module} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{module.replace("_", " ")}</p>
            {entries.map((entry) => (
              <label key={entry.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={granted.has(entry.key)}
                  onChange={() => toggle(entry.key)}
                  className="size-4 rounded border-input"
                />
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

  const refresh = useCallback(() => {
    api.listRoles().then((rs) => {
      setRoles(rs);
      if (!selectedRoleId && rs.length > 0) setSelectedRoleId(rs[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  const handleDelete = async (id: string) => {
    await api.deleteRole(id);
    setSelectedRoleId(null);
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Roles &amp; Permissions</h1>
          <p className="text-muted-foreground">Create custom roles and control what each one can do.</p>
        </div>
        <NewRoleDialog onCreated={refresh} />
      </div>

      <div className="flex flex-wrap gap-2">
        {roles.map((role) => (
          <div key={role.id} className="flex items-center gap-1">
            <Badge
              variant={role.id === selectedRoleId ? "default" : "outline"}
              className="cursor-pointer px-3 py-1.5"
              onClick={() => setSelectedRoleId(role.id)}
            >
              {role.name}
              {role.is_system && " (system)"}
            </Badge>
            {!role.is_system && role.id === selectedRoleId && (
              <Button variant="ghost" size="sm" onClick={() => handleDelete(role.id)}>
                <TrashIcon className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {selectedRole && <PermissionMatrix key={selectedRole.id} role={selectedRole} />}
    </div>
  );
}
