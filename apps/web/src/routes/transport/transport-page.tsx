import { useCallback, useEffect, useMemo, useState } from "react";
import { BusIcon, PencilIcon, PlusIcon, SearchIcon, UserPlusIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import {
  api,
  type StudentListItem,
  type TransportRoute,
  type TransportRosterEntry,
  type TransportStop,
} from "@/lib/api";
import { PersonLink } from "@/components/person-link";
import { IconTile } from "@/components/icon-tile";
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

const TRANSPORT_ACCENT = "var(--color-services)";

function NewRouteDialog({ onCreated }: { onCreated: () => void }) {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [capacity, setCapacity] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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
        capacity: capacity ? Number(capacity) : null,
      });
      setName("");
      setVehicleNumber("");
      setDriverName("");
      setDriverPhone("");
      setCapacity("");
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
          New route
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New route</DialogTitle></DialogHeader>
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
          <div className="flex flex-col gap-1.5">
            <Label>Seating capacity</Label>
            <Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Optional" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Add route"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditRouteDialog({ route, onUpdated }: { route: TransportRoute; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(route.name);
  const [vehicleNumber, setVehicleNumber] = useState(route.vehicle_number ?? "");
  const [driverName, setDriverName] = useState(route.driver_name ?? "");
  const [driverPhone, setDriverPhone] = useState(route.driver_phone ?? "");
  const [capacity, setCapacity] = useState(route.capacity ? String(route.capacity) : "");
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
        capacity: capacity ? Number(capacity) : null,
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
        <Button variant="ghost" size="sm">
          <PencilIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
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
          <div className="flex flex-col gap-1.5">
            <Label>Seating capacity</Label>
            <Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Optional" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CapacityBadge({ count, capacity }: { count: number; capacity?: number | null }) {
  if (!capacity) {
    return <Badge variant="outline">{count} assigned</Badge>;
  }
  const over = count > capacity;
  return <Badge variant={over ? "destructive" : "success"}>{count}/{capacity} seats</Badge>;
}

function AssignStudentForm({
  routeId,
  stops,
  onAssigned,
}: {
  routeId: string;
  stops: TransportStop[];
  onAssigned: () => void;
}) {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [studentId, setStudentId] = useState("");
  const [stopId, setStopId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (selectedBranchId) {
      api.listStudents(selectedBranchId).then((list) => setStudents(list.filter((s) => s.status === "enrolled")));
    }
  }, [selectedBranchId]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !stopId) return;
    setIsSubmitting(true);
    try {
      await api.assignStudentTransport(studentId, routeId, stopId);
      setStudentId("");
      setStopId("");
      onAssigned();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleAssign}>
      <div className="flex flex-col gap-1.5">
        <Label>Student</Label>
        <Select value={studentId} onValueChange={setStudentId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Select student" /></SelectTrigger>
          <SelectContent>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.first_name} {s.last_name ?? ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Stop</Label>
        <Select value={stopId} onValueChange={setStopId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Select stop" /></SelectTrigger>
          <SelectContent>
            {stops.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={isSubmitting || !studentId || !stopId}>
        <UserPlusIcon />
        Assign
      </Button>
    </form>
  );
}

function RouteDetail({ route, onRouteUpdated }: { route: TransportRoute; onRouteUpdated: () => void }) {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canManageRoutes = hasPermission("transport.manage_routes");
  const canManageAssignments = hasPermission("transport.manage_assignments");
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconTile icon={BusIcon} accent={TRANSPORT_ACCENT} size="md" />
          <div>
            <CardTitle className="text-lg">{route.name}</CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {route.vehicle_number && <span>Vehicle: {route.vehicle_number}</span>}
              {route.driver_name && <span>Driver: {route.driver_name}</span>}
              {route.driver_phone && <span>{route.driver_phone}</span>}
              <CapacityBadge count={roster.length} capacity={route.capacity} />
            </div>
          </div>
        </div>
        {canManageRoutes && <EditRouteDialog route={route} onUpdated={onRouteUpdated} />}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canManageRoutes && (
          <form className="flex flex-wrap items-end gap-3 rounded-md border p-3" onSubmit={handleAddStop}>
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
                      <button onClick={() => handleRenameStop(s)} className="hover:text-foreground">
                        <PencilIcon className="size-3" />
                      </button>
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
                <li key={r.student_id} className="flex items-center justify-between rounded border px-2 py-1">
                  <PersonLink type="student" id={r.student_id} name={[r.first_name, r.last_name].filter(Boolean).join(" ")} />
                  <span className="text-muted-foreground">{r.stop_name}</span>
                </li>
              ))}
              {roster.length === 0 && <li className="text-muted-foreground">No students assigned yet.</li>}
            </ul>
          </div>
        </div>

        {canManageAssignments && stops.length > 0 && (
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Assign student to this route</p>
            <AssignStudentForm routeId={route.id} stops={stops} onAssigned={refresh} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TransportPage() {
  const selectedBranchId = useAppStore((s) => s.selectedBranchId);
  const hasPermission = useAppStore((s) => s.hasPermission);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [rosterCounts, setRosterCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!selectedBranchId) return;
    api.listRoutes(selectedBranchId).then(async (list) => {
      setRoutes(list);
      const entries = await Promise.all(
        list.map(async (r) => [r.id, (await api.listRouteRoster(r.id)).length] as const),
      );
      setRosterCounts(Object.fromEntries(entries));
      setSelectedRouteId((current) => current ?? list[0]?.id ?? null);
    });
  }, [selectedBranchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredRoutes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return routes;
    return routes.filter(
      (r) => r.name.toLowerCase().includes(term) || (r.vehicle_number ?? "").toLowerCase().includes(term),
    );
  }, [routes, search]);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Transport</h1>
          <p className="text-muted-foreground">Bus routes, stops, and student assignments.</p>
        </div>
        {hasPermission("transport.manage_routes") && <NewRouteDialog onCreated={refresh} />}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or vehicle #..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            {filteredRoutes.map((r) => {
              const count = rosterCounts[r.id] ?? 0;
              const over = r.capacity != null && count > r.capacity;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRouteId(r.id)}
                  className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-muted ${
                    selectedRouteId === r.id ? "border-primary bg-muted" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.name}</span>
                    <CapacityBadge count={count} capacity={r.capacity} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {r.vehicle_number ?? "No vehicle #"}
                    {r.driver_name ? ` · ${r.driver_name}` : ""}
                  </span>
                  {over && <span className="text-xs text-destructive">Over capacity</span>}
                </button>
              );
            })}
            {filteredRoutes.length === 0 && (
              <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">No routes found.</p>
            )}
          </div>
        </div>

        <div>
          {selectedRoute ? (
            <RouteDetail route={selectedRoute} onRouteUpdated={refresh} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a route to see its stops and roster.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
