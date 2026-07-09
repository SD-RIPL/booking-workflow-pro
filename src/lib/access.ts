import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const MODULES = [
  "dashboard",
  "bookings",
  "customers",
  "recharges",
  "payments",
  "sims",
  "routers",
  "suspensions",
  "tickets",
  "chatbot",
  "reports",
  "audit",
  "search",
  "users",
] as const;

export type Module = (typeof MODULES)[number];

export const MODULE_LABEL: Record<Module, string> = {
  dashboard: "Dashboard",
  bookings: "Bookings",
  customers: "Customers",
  recharges: "Recharges",
  payments: "Payments",
  sims: "SIMs",
  routers: "Routers",
  suspensions: "Suspensions",
  tickets: "Tickets",
  chatbot: "Chatbot",
  reports: "Reports",
  audit: "Audit Log",
  search: "Search",
  users: "User Management",
};

export type Role =
  | "super_admin"
  | "admin"
  | "manager"
  | "operator"
  | "support"
  | "finance";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  operator: "Operator",
  support: "Support",
  finance: "Finance",
};

export const ROLE_DEFAULT_MODULES: Record<Role, Module[]> = {
  super_admin: [...MODULES],
  admin: MODULES.filter((m) => m !== "users") as Module[],
  manager: ["dashboard", "bookings", "customers", "recharges", "payments", "tickets", "chatbot", "reports", "audit", "search"],
  operator: ["dashboard", "bookings", "customers", "recharges", "sims", "routers", "tickets", "chatbot", "search"],
  support: ["dashboard", "bookings", "customers", "suspensions", "tickets", "chatbot", "search"],
  finance: ["dashboard", "bookings", "payments", "recharges", "reports", "search"],
};

export function computeAllowedModules(
  role: Role,
  overrides: Array<{ module: string; allowed: boolean }>,
): Set<Module> {
  if (role === "super_admin") return new Set<Module>(MODULES);

  const allowed = new Set<Module>(ROLE_DEFAULT_MODULES[role] ?? ["dashboard"]);
  for (const o of overrides) {
    const m = o.module as Module;
    if (!MODULES.includes(m)) continue;
    if (o.allowed) allowed.add(m);
    else allowed.delete(m);
  }
  return allowed;
}

export function pathToModule(pathname: string): Module | null {
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return null;
  if ((MODULES as readonly string[]).includes(seg)) return seg as Module;
  return null;
}

export function useAccess(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ["access", userId],
    queryFn: async () => {
      const [rolesRes, overridesRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId!),
        supabase
          .from("user_module_access")
          .select("module,allowed")
          .eq("user_id", userId!),
        supabase
          .from("profiles")
          .select("full_name,email")
          .eq("id", userId!)
          .maybeSingle(),
      ]);

      if (rolesRes.error) throw rolesRes.error;
      if (overridesRes.error) throw overridesRes.error;
      if (profileRes.error) throw profileRes.error;

      const roles = (rolesRes.data ?? []).map((r) => r.role as Role);
      // pick highest privilege
      const priority: Role[] = [
        "super_admin",
        "admin",
        "manager",
        "finance",
        "support",
        "operator",
      ];
      const role = priority.find((p) => roles.includes(p)) ?? "support";
      const overrides = (overridesRes.data ?? []) as Array<{
        module: string;
        allowed: boolean;
      }>;
      const allowed = computeAllowedModules(role, overrides);
      return {
        role,
        roles,
        overrides,
        allowed,
        profile: profileRes.data,
      };
    },
  });
}
