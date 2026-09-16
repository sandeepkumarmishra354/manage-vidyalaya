import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type House } from "@/lib/api";
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

export function HousesTab() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManageTeams = hasPermission("houses.manage_teams");
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
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {canManageTeams && (
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
      )}

      <div className="flex flex-wrap gap-2">
        {houses.map((h) => (
          <Badge key={h.id} style={{ backgroundColor: h.color ?? undefined, color: "white" }} className="gap-1.5">
            {h.name}
            {canManageTeams && <EditHouseDialog house={h} onUpdated={refresh} />}
          </Badge>
        ))}
      </div>
    </div>
  );
}
