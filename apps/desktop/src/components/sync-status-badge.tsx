import { useEffect, useState } from "react";
import { CloudIcon, CloudOffIcon, RefreshCwIcon } from "lucide-react";

import { api, type SyncStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SyncStatusBadge() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getSyncStatus().then((s) => !cancelled && setStatus(s));
    const interval = setInterval(() => {
      api.getSyncStatus().then((s) => !cancelled && setStatus(s));
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const s = await api.syncNow();
      setStatus(s);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!status) return null;

  return (
    <div className="flex items-center gap-2">
      <Badge variant={status.is_online ? "secondary" : "outline"} className="gap-1.5">
        {status.is_online ? (
          <CloudIcon className="text-emerald-600" />
        ) : (
          <CloudOffIcon className="text-muted-foreground" />
        )}
        {status.is_online ? "Online" : "Offline"}
        {status.pending_count > 0 && (
          <span className="text-muted-foreground">· {status.pending_count} pending</span>
        )}
      </Badge>
      <Button variant="ghost" size="icon" onClick={handleSyncNow} disabled={isSyncing}>
        <RefreshCwIcon className={cn("size-4", isSyncing && "animate-spin")} />
        <span className="sr-only">Sync now</span>
      </Button>
    </div>
  );
}
