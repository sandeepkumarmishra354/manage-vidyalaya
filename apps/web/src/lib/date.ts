// Prisma has no date-only JS type, so every conceptually date-only field
// (date_of_birth, attendance_date, due_date, etc.) still serializes with a
// spurious time component ("2026-09-29T00:00:00.000Z") over JSON. These
// helpers render that consistently: date-only where only the date matters,
// date+time (in the viewer's local time zone) where the time is meaningful.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(iso));
}
