import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { CameraIcon, CheckCircle2Icon, ScanLineIcon, XCircleIcon } from "lucide-react";

import { useAppStore } from "@/stores/app-store";
import { api, type ScanEntityType, type ScanResult } from "@/lib/api";
import { ApiError } from "@/lib/http";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SCANNER_ELEMENT_ID = "qr-scanner-region";
// The camera keeps re-decoding a still-visible code every frame; this
// client-side debounce is belt-and-suspenders on top of the server's own
// idempotent upsert, so a code held in front of the camera doesn't spam
// duplicate "already_marked" entries into the log.
const RESCAN_DEBOUNCE_MS = 3000;

interface ScanLogEntry {
  id: string;
  at: Date;
  ok: boolean;
  message: string;
}

export function ScanAttendancePage() {
  const hasPermission = useAppStore((s) => s.hasPermission);
  const canScanStudents = hasPermission("attendance.mark");
  const canScanStaff = hasPermission("staff_attendance.mark");

  const [mode, setMode] = useState<ScanEntityType>(canScanStudents ? "student" : "staff");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [log, setLog] = useState<ScanLogEntry[]>([]);
  const [tally, setTally] = useState({ marked: 0, already_marked: 0, errors: 0 });

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ token: string; at: number } | null>(null);
  const busyRef = useRef(false);

  // The debounce only applies to the camera's continuous decode loop (the
  // same still-visible code gets re-decoded every frame). A manual submit
  // is a single explicit action -- e.g. resubmitting on purpose to confirm
  // idempotency -- and must never be silently swallowed.
  const submitToken = async (token: string, { debounce = false }: { debounce?: boolean } = {}) => {
    const trimmed = token.trim();
    if (!trimmed || busyRef.current) return;

    if (debounce) {
      const last = lastScanRef.current;
      if (last && last.token === trimmed && Date.now() - last.at < RESCAN_DEBOUNCE_MS) {
        return;
      }
    }
    lastScanRef.current = { token: trimmed, at: Date.now() };
    busyRef.current = true;

    try {
      const scan = mode === "student" ? api.scanAttendance : api.scanStaffAttendance;
      const result: ScanResult = await scan(trimmed);
      const label = result.name + (result.class_name ? ` (${result.class_name}${result.section_name ? ` ${result.section_name}` : ""})` : result.designation ? ` (${result.designation})` : "");
      if (result.status === "already_marked") {
        setTally((t) => ({ ...t, already_marked: t.already_marked + 1 }));
        pushLog(true, `${label} -- already marked ${result.existing_status} today`);
      } else {
        setTally((t) => ({ ...t, marked: t.marked + 1 }));
        pushLog(true, `${label} -- marked present`);
      }
    } catch (err) {
      setTally((t) => ({ ...t, errors: t.errors + 1 }));
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
      pushLog(false, message);
    } finally {
      busyRef.current = false;
    }
  };

  const pushLog = (ok: boolean, message: string) => {
    setLog((prev) => [{ id: crypto.randomUUID(), at: new Date(), ok, message }, ...prev].slice(0, 20));
  };

  // Camera lifecycle: start on mount (once at least one scan mode is
  // available), stop+clear on unmount. Headless test runners can't grant
  // camera access, so a failure here is expected there -- the manual
  // "enter code" fallback below still works without it.
  useEffect(() => {
    if (!canScanStudents && !canScanStaff) return;
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;
    let cancelled = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          void submitToken(decodedText, { debounce: true });
        },
        () => {
          // per-frame decode failures are normal while no code is in view
        },
      )
      .catch((err) => {
        if (!cancelled) {
          setCameraError(err instanceof Error ? err.message : "Could not access the camera.");
        }
      });

    return () => {
      cancelled = true;
      if (scanner.isScanning) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
      } else {
        scanner.clear();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canScanStudents, canScanStaff]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitToken(manualCode);
    setManualCode("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Scan Attendance</h1>
        <p className="text-muted-foreground">Point the camera at a student or staff QR code to mark them present.</p>
      </div>

      {canScanStudents && canScanStaff && (
        <div className="flex gap-2">
          <Button variant={mode === "student" ? "default" : "outline"} onClick={() => setMode("student")}>
            Student
          </Button>
          <Button variant={mode === "staff" ? "default" : "outline"} onClick={() => setMode("staff")}>
            Staff
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CameraIcon className="size-4" />
              Camera
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div id={SCANNER_ELEMENT_ID} className="w-full overflow-hidden rounded-lg bg-black" />
            {cameraError && (
              <p className="text-sm text-muted-foreground">
                Camera unavailable ({cameraError}). Use the manual entry below instead.
              </p>
            )}

            <form className="flex items-end gap-2" onSubmit={handleManualSubmit}>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="manual-code">Enter code manually</Label>
                <Input
                  id="manual-code"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Paste or type the QR token"
                />
              </div>
              <Button type="submit" disabled={!manualCode.trim()}>
                <ScanLineIcon className="size-3.5" />
                Submit
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">This session</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-4 text-sm">
              <span>
                Marked: <span className="font-semibold text-foreground">{tally.marked}</span>
              </span>
              <span>
                Already marked: <span className="font-semibold text-foreground">{tally.already_marked}</span>
              </span>
              <span>
                Errors: <span className="font-semibold text-destructive">{tally.errors}</span>
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {log.length === 0 && <p className="text-sm text-muted-foreground">No scans yet.</p>}
              {log.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                  {entry.ok ? (
                    <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <div className="flex-1">
                    <p>{entry.message}</p>
                    <p className="text-xs text-muted-foreground">{entry.at.toLocaleTimeString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
