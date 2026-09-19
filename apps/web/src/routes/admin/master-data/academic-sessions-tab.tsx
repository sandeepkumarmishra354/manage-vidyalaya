import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type AcademicSession } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function EditSessionDialog({ session, onUpdated }: { session: AcademicSession; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(session.name);
  const [startDate, setStartDate] = useState(session.start_date);
  const [endDate, setEndDate] = useState(session.end_date);
  const [isCurrent, setIsCurrent] = useState(session.is_current);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.updateAcademicSession({ id: session.id, name, start_date: startDate, end_date: endDate, is_current: isCurrent });
      setOpen(false);
      onUpdated();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><PencilIcon className="size-3.5" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit academic session</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isCurrent} onChange={(e) => setIsCurrent(e.target.checked)} className="size-4 rounded border-input" />
            Current session
          </label>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AcademicSessionsTab() {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManage = hasPermission("academic_setup.manage_sessions");
  const refreshStoreAcademicSessions = useAppStore((s) => s.refreshAcademicSessions);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(() => {
    api.listAcademicSessions().then(setSessions);
    refreshStoreAcademicSessions();
  }, [refreshStoreAcademicSessions]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.createAcademicSession({
        name,
        start_date: startDate,
        end_date: endDate,
        is_current: sessions.length === 0,
      });
      setName("");
      setStartDate("");
      setEndDate("");
      refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New academic session</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleCreate}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="session-name">Name</Label>
              <Input
                id="session-name"
                placeholder="e.g. 2027-2028"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="session-start">Start date</Label>
              <Input
                id="session-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="session-end">End date</Label>
              <Input
                id="session-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-40"
              />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              <PlusIcon />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{formatDate(s.start_date)}</TableCell>
                <TableCell>{formatDate(s.end_date)}</TableCell>
                <TableCell>{s.is_current && <Badge>Current</Badge>}</TableCell>
                <TableCell>
                  {canManage && <EditSessionDialog session={s} onUpdated={refresh} />}
                </TableCell>
              </TableRow>
            ))}
            {sessions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No academic sessions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
