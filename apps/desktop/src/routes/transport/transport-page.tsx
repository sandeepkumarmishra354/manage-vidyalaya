import { useCallback, useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type TransportRoute, type TransportRosterEntry, type TransportStop } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function RouteDetail({ route }: { route: TransportRoute }) {
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

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
        {route.vehicle_number && <span>Vehicle: {route.vehicle_number}</span>}
        {route.driver_name && <span>Driver: {route.driver_name}</span>}
        {route.driver_phone && <span>{route.driver_phone}</span>}
        {route.capacity && <span>Capacity: {route.capacity}</span>}
      </div>

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">Stops</p>
          <ul className="flex flex-col gap-1 text-sm">
            {stops.map((s) => (
              <li key={s.id} className="flex justify-between rounded border px-2 py-1">
                <span>{s.name}</span>
                <span className="text-muted-foreground">{s.pickup_time ?? "—"}</span>
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

      {expandedRouteId && <RouteDetail route={routes.find((r) => r.id === expandedRouteId)!} />}
    </div>
  );
}
