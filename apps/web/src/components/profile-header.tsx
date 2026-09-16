import type { LucideIcon } from "lucide-react";
import type { VariantProps } from "class-variance-authority";

import { Badge, badgeVariants } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { IconTile } from "@/components/icon-tile";

// Shared full-page profile header for the student and staff detail pages:
// a big icon tile, name, status badge, a row of quick facts, and an
// actions row (rendered by the caller, typically IconTileButtons).
export function ProfileHeader({
  icon,
  accent = "var(--color-primary)",
  name,
  status,
  statusVariant = "secondary",
  facts,
  actions,
}: {
  icon: LucideIcon;
  accent?: string;
  name: string;
  status?: string;
  statusVariant?: VariantProps<typeof badgeVariants>["variant"];
  facts?: { label: string; value: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-6 pt-6">
        <div className="flex items-center gap-4">
          <IconTile icon={icon} accent={accent} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{name}</h1>
              {status && <Badge variant={statusVariant}>{status}</Badge>}
            </div>
            {facts && facts.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {facts.map((f) => (
                  <span key={f.label}>
                    {f.label}: <span className="font-medium text-foreground">{f.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </CardContent>
    </Card>
  );
}
