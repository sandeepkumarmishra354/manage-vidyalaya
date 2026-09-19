import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTile } from "@/components/icon-tile";
import { cn } from "@/lib/utils";

// Standardizes the label/value grid pattern duplicated across student/staff
// detail pages (each had its own local `Field` helper). Pass `fields` for
// the common case, or `children` for sections needing custom content
// (tables, lists) instead of a flat field grid.
export function DetailSection({
  title,
  icon,
  accent = "var(--color-primary)",
  actions,
  fields,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  accent?: string;
  actions?: React.ReactNode;
  fields?: { label: string; value: React.ReactNode; span?: boolean }[];
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon && <IconTile icon={icon} accent={accent} size="sm" />}
          {title}
        </CardTitle>
        {actions}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {fields && (
          <div className="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.label} className={cn(f.span && "sm:col-span-2")}>
                <p className="text-muted-foreground">{f.label}</p>
                <p className="font-medium">{f.value}</p>
              </div>
            ))}
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
