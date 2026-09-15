import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon, TrophyIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type House, type HouseLeaderboardRow, type HousePointEventListItem } from "@/lib/api";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function EditHouseDialog({ house, onUpdated }: { house: House; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(house.name);
  const [color, setColor] = useState(house.color ?? "#dc2626");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.updateHouse({ id: house.id, name, color });
      setOpen(false);
      onUpdated();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="opacity-70 hover:opacity-100"><PencilIcon className="size-3" /></button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit house</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-16 rounded-md border" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function LeaderboardTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [rows, setRows] = useState<HouseLeaderboardRow[]>([]);

  useEffect(() => {
    if (selectedBranchId) api.getHouseLeaderboard(selectedBranchId).then(setRows);
  }, [selectedBranchId]);

  const maxPoints = Math.max(1, ...rows.map((r) => r.total_points));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, i) => (
        <Card key={row.house_id} className="overflow-hidden">
          <CardContent className="flex items-center gap-4 pt-6">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: row.color ?? "#64748b" }}
            >
              {i === 0 ? <TrophyIcon className="size-5" /> : `#${i + 1}`}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{row.house_name}</p>
                <p className="font-bold">{row.total_points} pts</p>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(4, (Math.max(row.total_points, 0) / maxPoints) * 100)}%`,
                    backgroundColor: row.color ?? "#64748b",
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{row.student_count} students</p>
            </div>
          </CardContent>
        </Card>
      ))}
      {rows.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">No houses set up yet.</p>
      )}
    </div>
  );
}

function HousesTab({ onChanged }: { onChanged: () => void }) {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [houses, setHouses] = useState<House[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#dc2626");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(() => {
    if (selectedBranchId) api.listHouses(selectedBranchId).then(setHouses);
  }, [selectedBranchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) return;
    setIsSubmitting(true);
    try {
      await api.createHouse({ branch_id: selectedBranchId, name, color });
      setName("");
      refresh();
      onChanged();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New house</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleCreate}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="house-name">Name</Label>
              <Input
                id="house-name"
                placeholder="e.g. Red House"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-48"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="house-color">Color</Label>
              <input
                id="house-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-16 rounded-md border"
              />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              <PlusIcon />
              Add house
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {houses.map((h) => (
          <Badge key={h.id} style={{ backgroundColor: h.color ?? undefined, color: "white" }} className="gap-1.5">
            {h.name}
            <EditHouseDialog house={h} onUpdated={refresh} />
          </Badge>
        ))}
      </div>
    </div>
  );
}

function PointsTab({ houses, onChanged }: { houses: House[]; onChanged: () => void }) {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [events, setEvents] = useState<HousePointEventListItem[]>([]);
  const [houseId, setHouseId] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(() => {
    if (selectedBranchId) api.listHousePointEvents(selectedBranchId).then(setEvents);
  }, [selectedBranchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId || !houseId) return;
    setIsSubmitting(true);
    try {
      await api.awardHousePoints({
        branch_id: selectedBranchId,
        house_id: houseId,
        student_id: null,
        academic_session_id: null,
        points: Number(points),
        reason,
        event_date: todayIso(),
      });
      setPoints("");
      setReason("");
      refresh();
      onChanged();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Award / deduct points</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleAward}>
            <div className="flex flex-col gap-1.5">
              <Label>House</Label>
              <Select value={houseId} onValueChange={setHouseId}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Select house" />
                </SelectTrigger>
                <SelectContent>
                  {houses.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="points">Points</Label>
              <Input
                id="points"
                type="number"
                placeholder="e.g. 10 or -5"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                required
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                placeholder="e.g. Sports day 1st place"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                className="w-64"
              />
            </div>
            <Button type="submit" disabled={isSubmitting || !houseId}>
              Award
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>House</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.event_date}</TableCell>
                <TableCell className="font-medium">{e.house_name}</TableCell>
                <TableCell className={e.points >= 0 ? "text-emerald-600" : "text-destructive"}>
                  {e.points >= 0 ? `+${e.points}` : e.points}
                </TableCell>
                <TableCell>{e.reason}</TableCell>
              </TableRow>
            ))}
            {events.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No points awarded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function HousesPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [houses, setHouses] = useState<House[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (selectedBranchId) api.listHouses(selectedBranchId).then(setHouses);
  }, [selectedBranchId, refreshKey]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Houses</h1>
        <p className="text-muted-foreground">House teams, points, and the leaderboard.</p>
      </div>
      <Tabs defaultValue="leaderboard">
        <TabsList>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="points">Points</TabsTrigger>
          <TabsTrigger value="houses">Houses</TabsTrigger>
        </TabsList>
        <TabsContent value="leaderboard">
          <LeaderboardTab key={refreshKey} />
        </TabsContent>
        <TabsContent value="points">
          <PointsTab houses={houses} onChanged={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>
        <TabsContent value="houses">
          <HousesTab onChanged={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
