import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { MODULES, MODULE_LABEL, ROLE_LABEL, ROLE_DEFAULT_MODULES, type Module, type Role } from "@/lib/access";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/permissions")({
  ssr: false,
  component: PermissionsPage,
});

function PermissionsPage() {
  const { user } = Route.useRouteContext();
  const { isAdmin, isLoading } = useIsAdmin(user.id);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) {
    return (
      <div className="p-10 text-center">
        <Lock className="w-10 h-10 mx-auto text-destructive mb-3" />
        <h2 className="text-xl font-semibold">Admin only</h2>
      </div>
    );
  }
  return <PermMatrix />;
}

function PermMatrix() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["perm-users"],
    queryFn: async () => {
      const [profs, roles, overrides] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email"),
        supabase.from("user_roles").select("user_id,role"),
        supabase.from("user_module_access").select("user_id,module,allowed"),
      ]);
      if (profs.error) throw profs.error;
      const rolesByUser: Record<string, Role> = {};
      const priority: Role[] = ["super_admin","admin","manager","finance","support","operator"];
      for (const r of roles.data ?? []) {
        const cur = rolesByUser[r.user_id];
        const next = r.role as Role;
        if (!cur || priority.indexOf(next) < priority.indexOf(cur)) rolesByUser[r.user_id] = next;
      }
      const ovByUser: Record<string, Record<string, boolean>> = {};
      for (const o of overrides.data ?? []) {
        ovByUser[o.user_id] ??= {};
        ovByUser[o.user_id][o.module] = o.allowed;
      }
      return (profs.data ?? []).map((p) => ({
        ...p,
        role: rolesByUser[p.id] ?? "support" as Role,
        overrides: ovByUser[p.id] ?? {},
      }));
    },
  });

  async function toggle(userId: string, role: Role, module: Module, next: boolean) {
    const defaultAllowed = (ROLE_DEFAULT_MODULES[role] as Module[]).includes(module);
    // If next matches default -> remove override; else upsert override
    if (next === defaultAllowed) {
      await supabase.from("user_module_access").delete().eq("user_id", userId).eq("module", module);
    } else {
      await supabase.from("user_module_access").upsert(
        { user_id: userId, module, allowed: next },
        { onConflict: "user_id,module" },
      );
    }
    toast.success(`${MODULE_LABEL[module]} ${next ? "granted" : "revoked"}`);
    qc.invalidateQueries({ queryKey: ["perm-users"] });
    qc.invalidateQueries({ queryKey: ["access"] });
  }

  return (
    <>
      <PageHeader title="Permissions Matrix" description="Per-staff module access — overrides the role defaults." />
      <div className="p-6">
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 uppercase text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 min-w-[220px]">User</th>
                <th className="text-left px-3 py-2">Role</th>
                {MODULES.map((m) => (
                  <th key={m} className="text-center px-2 py-2 whitespace-nowrap">{MODULE_LABEL[m]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.map((u) => (
                <tr key={u.id} className="hover:bg-accent/20">
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.full_name ?? u.email}</div>
                    <div className="text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="px-3 py-2">{ROLE_LABEL[u.role]}</td>
                  {MODULES.map((m) => {
                    const defaultAllowed = u.role === "super_admin" || (ROLE_DEFAULT_MODULES[u.role] as Module[]).includes(m);
                    const override = u.overrides[m];
                    const effective = override === undefined ? defaultAllowed : override;
                    const disabled = u.role === "super_admin";
                    return (
                      <td key={m} className="text-center px-2 py-2">
                        <Checkbox
                          checked={effective}
                          disabled={disabled}
                          onCheckedChange={(c) => toggle(u.id, u.role, m, !!c)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-xs text-muted-foreground mt-3">
          Super Admin has all modules by default. Ticked = allowed. Changes save instantly and take effect on next page load.
        </p>
      </div>
    </>
  );
}
