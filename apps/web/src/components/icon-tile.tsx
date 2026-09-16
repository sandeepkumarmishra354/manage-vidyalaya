import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

// Shared "big icon" visual language used across the app (dashboard stat
// cards, profile page headers/actions, module quick-actions) -- a
// gradient tile built from a single CSS color, matching the `accent`
// convention already used by PrintLetterhead (var(--color-finance) etc).
const TILE_SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "size-8 rounded-lg",
  md: "size-11 rounded-xl",
  lg: "size-14 rounded-2xl",
};

const ICON_SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

export function IconTile({
  icon: Icon,
  accent = "var(--color-primary)",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  accent?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center text-white shadow-md",
        TILE_SIZE_CLASSES[size],
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(135deg, ${accent}, color-mix(in oklch, ${accent} 70%, black))`,
        boxShadow: `0 4px 14px color-mix(in oklch, ${accent} 35%, transparent)`,
      }}
    >
      <Icon className={ICON_SIZE_CLASSES[size]} />
    </div>
  );
}

// A big icon-over-label action button -- the "old-school toolbar icon"
// look the user asked for, evolved to fit the app's existing gradient
// tile style rather than a literal retro redesign.
export function IconTileButton({
  icon,
  label,
  onClick,
  href,
  accent = "var(--color-primary)",
  type = "button",
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  accent?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const content = (
    <>
      <IconTile icon={icon} accent={accent} size="md" />
      <span className="text-xs font-medium text-foreground">{label}</span>
    </>
  );
  const className =
    "flex flex-col items-center gap-2 rounded-xl border bg-card p-3 text-center transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50";

  if (href) {
    return (
      <Link to={href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={className}>
      {content}
    </button>
  );
}
