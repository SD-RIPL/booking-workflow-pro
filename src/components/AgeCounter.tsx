import { Clock } from "lucide-react";

export function ageInDays(from: string | Date | null | undefined): number | null {
  if (!from) return null;
  const d = typeof from === "string" ? new Date(from) : from;
  if (isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function ageLabel(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.floor(days / 30)}mo ${days % 30}d`;
  return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}mo`;
}

export function AgeCounter({
  from,
  label,
  warnAfter = 3,
  dangerAfter = 7,
  showIcon = true,
}: {
  from: string | Date | null | undefined;
  label?: string;
  warnAfter?: number;
  dangerAfter?: number;
  showIcon?: boolean;
}) {
  const days = ageInDays(from);
  const tone =
    days == null
      ? "text-muted-foreground bg-muted"
      : days >= dangerAfter
      ? "text-destructive bg-destructive/10"
      : days >= warnAfter
      ? "text-warning-foreground bg-warning/20"
      : "text-info bg-info/10";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {showIcon && <Clock className="w-3 h-3" />}
      {label ? `${label}: ` : ""}
      {ageLabel(days)}
    </span>
  );
}
