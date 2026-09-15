import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type TransportRoute, type TransportRosterEntry, type TransportStop } from "@/lib/api";
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

function EditRouteDialog({ route, onUpdated }: { route: TransportRoute; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(route.name);
  const [vehicleNumber, setVehicleNumber] = useState(route.vehicle_number ?? "");
  const [driverName, setDriverName] = useState(route.driver_name ?? "");
  const [driverPhone, setDriverPhone] = useState(route.driver_phone ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.updateRoute({
        id: route.id,
        name,
        vehicle_number: vehicleNumber || null,
        driver_name: driverName || null,
        driver_phone: driverPhone || null,
        capacity: route.capacity,
      });
      setOpen(false);
      onUpdated();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}><PencilIcon className="size-3.5" /></Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>Edit route</DialogTitle></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Vehicle #</Label>
            <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Driver</Label>
            <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Driver phone</Label>
            <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RouteDetail({ route, onRouteUpdated }: { route: TransportRoute; onRouteUpdated: () => void }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManageRoutes = hasPermission("transport.manage_routes");
  const [stops, setStops] = useState<TransportStop[]>([]);
  const [roster, setRoster] = useState<TransportRosterEntry[]>([]);
  const [stopName, setStopName] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(() => {
    api.listStops(route.id).then(setStops);
    api.listRouteRoster(route.id).then(setRoster);
  }, [route.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAddStop = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.createStop({
        route_id: route.id,
        name: stopName,
        sequence: stops.length + 1,
        pickup_time: pickupTime || null,
      });
      setStopName("");
      setPickupTime("");
      refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenameStop = async (stop: TransportStop) => {
    const name = window.prompt("Rename stop", stop.name);
    if (!name || name === stop.name) return;
    await api.updateStop({ id: stop.id, name, sequence: stop.sequence, pickup_time: stop.pickup_time });
    refresh();
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          {route.vehicle_number && <span>Vehicle: {route.vehicle_number}</span>}
          {route.driver_name && <span>Driver: {route.driver_name}</span>}
          {route.driver_phone && <span>{route.driver_phone}</span>}
          {route.capacity && <span>Capacity: {route.capacity}</span>}
        </div>
        {canManageRoutes && <EditRouteDialog route={route} onUpdated={onRouteUpdated} />}
      </div>

      {canManageRoutes && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={handleAddStop}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`stop-${route.id}`}>New stop</Label>
            <Input
              id={`stop-${route.id}`}
              placeholder="e.g. Gandhi Chowk"
              value={stopName}
              onChange={(e) => setStopName(e.target.value)}
              required
              className="w-48"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Pickup time</Label>
            <Input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="w-32" />
          </div>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            Add stop
          </Button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">Stops</p>
          <ul className="flex flex-col gap-1 text-sm">
            {stops.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded border px-2 py-1">
                <span>{s.name}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {s.pickup_time ?? "—"}
                  {canManageRoutes && (
                    <button onClick={() => handleRenameStop(s)} className="hover:text-foreground"><PencilIcon className="size-3" /></button>
                  )}
                </span>
              </li>
            ))}
            {stops.length === 0 && <li className="text-muted-foreground">No stops yet.</li>}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Students on this route</p>
          <ul className="flex flex-col gap-1 text-sm">
            {roster.map((r) => (
              <li key={r.student_id} className="flex justify-between rounded border px-2 py-1">
                <span>
                  {r.first_name} {r.last_name ?? ""}
                </span>
                <span className="text-muted-foreground">{r.stop_name}</span>
              </li>
            ))}
            {roster.length === 0 && <li className="text-muted-foreground">No students assigned yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function TransportPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [name, setName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (selectedBranchId) api.listRoutes(selectedBranchId).then(setRoutes);
  }, [selectedBranchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) return;
    setIsSubmitting(true);
    try {
      await api.createRoute({
        branch_id: selectedBranchId,
        name,
        vehicle_number: vehicleNumber || null,
        driver_name: driverName || null,
        driver_phone: driverPhone || null,
        capacity: null,
      });
      setName("");
      setVehicleNumber("");
      setDriverName("");
      setDriverPhone("");
      refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Transport</h1>
        <p className="text-muted-foreground">Bus routes, stops, and student assignments.</p>
      </div>

      {hasPermission("transport.manage_routes") && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New route</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-4" onSubmit={handleCreate}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="route-name">Name</Label>
              <Input id="route-name" value={name} onChange={(e) => setName(e.target.value)} required className="w-48" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vehicle-number">Vehicle #</Label>
              <Input id="vehicle-number" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className="w-32" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="driver-name">Driver</Label>
              <Input id="driver-name" value={driverName} onChange={(e) => setDriverName(e.target.value)} className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="driver-phone">Driver phone</Label>
              <Input id="driver-phone" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} className="w-36" />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              <PlusIcon />
              Add route
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Driver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => setExpandedRouteId(expandedRouteId === r.id ? null : r.id)}
              >
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.vehicle_number ?? "—"}</TableCell>
                <TableCell>{r.driver_name ?? "—"}</TableCell>
              </TableRow>
            ))}
            {routes.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  No routes yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {expandedRouteId && (
        <RouteDetail route={routes.find((r) => r.id === expandedRouteId)!} onRouteUpdated={refresh} />
      )}
    </div>
  );
}
