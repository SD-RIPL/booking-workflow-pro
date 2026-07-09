import { cn } from "@/lib/utils";

const COLORS: Record<string, string> = {
  active: "bg-success/15 text-success border-success/30",
  due_soon: "bg-warning/20 text-warning-foreground border-warning/40",
  expired: "bg-destructive/15 text-destructive border-destructive/30",
  suspended: "bg-foreground/85 text-background border-foreground/40",
  disconnected: "bg-muted text-muted-foreground border-border",
  blacklisted: "bg-foreground text-background border-foreground",
  available: "bg-info/15 text-info border-info/30",
  assigned: "bg-accent text-accent-foreground border-accent",
  installed: "bg-success/15 text-success border-success/30",
  in_stock: "bg-info/15 text-info border-info/30",
  blocked: "bg-destructive/15 text-destructive border-destructive/30",
  lost: "bg-destructive/15 text-destructive border-destructive/30",
  damaged: "bg-destructive/15 text-destructive border-destructive/30",
  faulty: "bg-destructive/15 text-destructive border-destructive/30",
  returned: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const key = (status ?? "").toLowerCase();
  const cls = COLORS[key] ?? "bg-muted text-muted-foreground border-border";
  const label = (status ?? "—").replace(/_/g, " ");
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border capitalize", cls)}>
      {label}
    </span>
  );
}
