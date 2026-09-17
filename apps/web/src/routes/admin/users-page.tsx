import { useCallback, useEffect, useState } from "react";
import { SearchIcon } from "lucide-react";

import { api, type Role, type UserSummary } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ALL = "__all__";

export function UsersPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL);

  const refresh = useCallback(() => {
    api.listUsers(search || undefined, roleFilter === ALL ? undefined : roleFilter).then(setUsers);
    api.listRoles().then(setRoles);
  }, [search, roleFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  const handleToggleActive = async (user: UserSummary) => {
    await api.setUserActive(user.id, !user.is_active);
    refresh();
  };

  const handleAddRole = async (userId: string, roleId: string) => {
    if (!roleId) return;
    await api.assignUserRole(userId, roleId);
    refresh();
  };

  const handleRemoveRole = async (userId: string, roleId: string) => {
    await api.removeUserRole(userId, roleId);
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-muted-foreground">
          Manage logins and role assignments. To create a new login, go to a staff member's profile
          and click "Create login".
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All roles</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.full_name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {user.role_ids.map((roleId) => (
                      <Badge key={roleId} variant="outline" className="gap-1">
                        {roleName(roleId)}
                        <button onClick={() => handleRemoveRole(user.id, roleId)} className="text-muted-foreground hover:text-destructive">
                          ×
                        </button>
                      </Badge>
                    ))}
                    <Select onValueChange={(v) => handleAddRole(user.id, v)}>
                      <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="+ Add role" /></SelectTrigger>
                      <SelectContent>
                        {roles.filter((r) => !user.role_ids.includes(r.id)).map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={user.is_active ? "success" : "secondary"}>
                    {user.is_active ? "Active" : "Deactivated"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => handleToggleActive(user)}>
                    {user.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No user logins yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
