import { useCallback, useEffect, useState } from "react";

import { api, type AuditLogEntry } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/date";

const actionVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
  login: "outline",
  logout: "outline",
};

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [entityTable, setEntityTable] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);

  const refresh = useCallback(() => {
    api
      .listAuditLog({
        entity_table: entityTable || null,
        actor_user_id: null,
        from_date: fromDate || null,
        to_date: toDate || null,
        page,
      })
      .then(setEntries);
  }, [entityTable, fromDate, toDate, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="text-muted-foreground">Every create, update, and delete across the app, in one place.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entity-table">Entity table</Label>
          <Input
            id="entity-table"
            placeholder="e.g. students"
            value={entityTable}
            onChange={(e) => { setEntityTable(e.target.value); setPage(0); }}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from-date">From</Label>
          <Input id="from-date" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(0); }} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to-date">To</Label>
          <Input id="to-date" type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(0); }} className="w-40" />
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatDateTime(e.created_at)}
                </TableCell>
                <TableCell>{e.actor_name ?? "System"}</TableCell>
                <TableCell>
                  <Badge variant={actionVariant[e.action] ?? "outline"}>{e.action}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{e.entity_table}</TableCell>
                <TableCell>{e.summary}</TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No audit events for this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">Page {page + 1}</span>
        <Button variant="outline" size="sm" disabled={entries.length < 100} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
