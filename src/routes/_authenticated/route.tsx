import { createFileRoute, Outlet, redirect, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Users, CreditCard, Smartphone, Router as RouterIcon,
  Wallet, PauseCircle, FileText, Search, Wifi, LogOut, ScrollText, ShieldCheck, Lock,
  LifeBuoy, Bot, ClipboardList, Trash2, KeyRound, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAccess, type Module, ROLE_LABEL, pathToModule } from "@/lib/access";
import { RaiseTicketFab } from "@/components/RaiseTicketDialog";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; module: Module };

const NAV: NavItem[] = [
  { to: "/dashboard",     label: "Dashboard",     icon: LayoutDashboard, module: "dashboard" },
  { to: "/bookings",      label: "Bookings",      icon: ClipboardList,   module: "bookings" },
  { to: "/customers",     label: "Customers",     icon: Users,           module: "customers" },
  { to: "/recharges",     label: "Recharges",     icon: CreditCard,      module: "recharges" },
  { to: "/payments",      label: "Payments",      icon: Wallet,          module: "payments" },
  { to: "/sims",          label: "SIMs",          icon: Smartphone,      module: "sims" },
  { to: "/routers",       label: "Routers",       icon: RouterIcon,      module: "routers" },
  { to: "/suspensions",   label: "Suspensions",   icon: PauseCircle,     module: "suspensions" },
  { to: "/tickets",       label: "Tickets",       icon: LifeBuoy,        module: "tickets" },
  { to: "/notifications", label: "Notifications", icon: Bell,            module: "notifications" },
  { to: "/chatbot",       label: "Chatbot",       icon: Bot,             module: "chatbot" },
  { to: "/reports",       label: "Reports",       icon: FileText,        module: "reports" },
  { to: "/audit",         label: "Audit Log",     icon: ScrollText,      module: "audit" },
  { to: "/search",        label: "Search",        icon: Search,          module: "search" },
  { to: "/trash",         label: "Trash",         icon: Trash2,          module: "trash" },
  { to: "/permissions",   label: "Permissions",   icon: KeyRound,        module: "permissions" },
  { to: "/users",         label: "Users",         icon: ShieldCheck,     module: "users" },
];

function AuthenticatedLayout() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = Route.useRouteContext();

  const { data: access, isLoading, error } = useAccess(user.id);

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const role = access?.role ?? "support";
  const allowed = access?.allowed ?? new Set<Module>(["dashboard"]);
  const visibleNav = NAV.filter((n) => allowed.has(n.module));
  const currentModule = pathToModule(pathname);
  const blocked = !!currentModule && !allowed.has(currentModule);

  return (
    <div className="min-h-screen flex w-full bg-background">
      <aside className="w-64 shrink-0 hidden md:flex flex-col text-sidebar-foreground" style={{ background: "var(--gradient-sidebar)" }}>
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sidebar-primary/20 flex items-center justify-center">
              <Wifi className="w-5 h-5 text-sidebar-primary" />
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">Rishishwar</div>
              <div className="text-xs opacity-70">{ROLE_LABEL[role]} Portal</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "hover:bg-sidebar-accent text-sidebar-foreground/85"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-2 py-2 mb-2">
            <div className="text-sm font-medium truncate">{access?.profile?.full_name ?? user.email}</div>
            <div className="text-xs opacity-70">{ROLE_LABEL[role]}</div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading workspace…</div>
        ) : error ? (
          <div className="p-8 text-sm text-destructive">Access check failed. Please sign out and sign in again.</div>
        ) : blocked ? (
          <div className="min-h-[60vh] flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
                <Lock className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold">Access restricted</h2>
              <p className="text-muted-foreground text-sm">
                Your role <span className="font-medium">{ROLE_LABEL[role]}</span> does not have access to this module.
                Please contact a Super Admin if you need access.
              </p>
              <Button onClick={() => router.navigate({ to: "/dashboard" })}>Go to Dashboard</Button>
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
      {!isLoading && !error && !blocked && allowed.has("tickets") && <RaiseTicketFab />}
    </div>
  );
}
