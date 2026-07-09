import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Lock, ShieldCheck, Settings2 } from "lucide-react";
import {
  MODULES, MODULE_LABEL, ROLE_LABEL, computeAllowedModules,
  type Module, type Role, useAccess,
} from "@/lib/access";
import { InviteUserDialog } from "@/components/InviteUserDialog";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

const ROLES: Role[] = ["super_admin", "admin", "manager", "finance", "support", "operator"];

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  roles: Role[];
  overrides: Array<{ module: string; allowed: boolean }>;
};

function UsersPage() {
  const { user } = Route.useRouteContext();
  const { data: me } = useAccess(user.id);
  const qc = useQueryClient();
  const isSuperAdmin = me?.role === "super_admin";

  const { data: rows = [], isLoading } = useQuery({
    enabled: isSuperAdmin,
    queryKey: ["all-users"],
    queryFn: async (): Promise<UserRow[]> => {
      const [profiles, roles, overrides] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id,role"),
        supabase.from("user_module_access").select("user_id,module,allowed"),
      ]);
      const rolesByUser = new Map<string, Role[]>();
      (roles.data ?? []).forEach((r: any) => {
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push(r.role as Role);
        rolesByUser.set(r.user_id, list);
      });
      const overridesByUser = new Map<string, Array<{ module: string; allowed: boolean }>>();
      (overrides.data ?? []).forEach((o: any) => {
        const list = overridesByUser.get(o.user_id) ?? [];
        list.push({ module: o.module, allowed: o.allowed });
        overridesByUser.set(o.user_id, list);
      });
      return (profiles.data ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        roles: rolesByUser.get(p.id) ?? [],
        overrides: overridesByUser.get(p.id) ?? [],
      }));
    },
  });

  const [editing, setEditing] = useState<UserRow | null>(null);

  if (!me) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold">Super Admin only</h2>
          <p className="text-muted-foreground text-sm">
            User Management is restricted to Super Admins. Contact a Super Admin to request changes.
          </p>
        </div>
      </div>
    );
  }

  async function setRole(userId: string, newRole: Role) {
    // delete all existing roles for user, then insert the new one
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delErr) return toast.error(delErr.message);
    const { error: insErr } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: newRole });
    if (insErr) return toast.error(insErr.message);
    toast.success(`Role updated to ${ROLE_LABEL[newRole]}`);
    qc.invalidateQueries({ queryKey: ["all-users"] });
    qc.invalidateQueries({ queryKey: ["access"] });
  }

  return (
    <>
      <PageHeader
        title="User Management"
        description="Assign roles, invite new team members, and fine-tune module access."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Super Admin
            </Badge>
            <InviteUserDialog />
          </div>
        }
      />

      <div className="p-6 space-y-6">
        <div className="rounded-xl border bg-card p-4 text-sm">
          <p className="font-medium mb-1">Two ways to add a team member</p>
          <ol className="list-decimal pl-5 text-muted-foreground space-y-1">
            <li><span className="font-medium text-foreground">Invite (recommended)</span> — click <span className="font-medium">Invite User</span>, pick role &amp; modules, and share the generated link. On signup the role and access apply automatically.</li>
            <li><span className="font-medium text-foreground">Manual</span> — if the user already signed up, assign their role and modules from the table below.</li>
          </ol>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Effective Access</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading users…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No users yet.</TableCell></TableRow>
              )}
              {rows.map((r) => {
                const primaryRole: Role = r.roles[0] ?? "support";
                const allowed = computeAllowedModules(primaryRole, r.overrides);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={primaryRole}
                        onValueChange={(v) => setRole(r.id, v as Role)}
                        disabled={r.id === user.id}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>{ROLE_LABEL[role]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {[...allowed].map((m) => (
                          <Badge key={m} variant="outline" className="text-xs">{MODULE_LABEL[m]}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                        <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Customize Access
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {editing && (
        <AccessEditor
          key={editing.id}
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["all-users"] });
            qc.invalidateQueries({ queryKey: ["access"] });
          }}
        />
      )}
    </>
  );
}

function AccessEditor({
  user, onClose, onSaved,
}: {
  user: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const role: Role = user?.roles[0] ?? "support";
  const [selected, setSelected] = useState<Set<Module>>(() =>
    user ? computeAllowedModules(role, user.overrides) : new Set<Module>(),
  );

  function toggle(m: Module, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(m); else next.delete(m);
    setSelected(next);
  }

  async function save() {
    if (!user) return;
    const defaults = computeAllowedModules(role, []);
    const upserts: Array<{ user_id: string; module: string; allowed: boolean }> = [];
    for (const m of MODULES) {
      const want = selected.has(m);
      const def = defaults.has(m);
      if (want !== def) upserts.push({ user_id: user.id, module: m, allowed: want });
    }
    const { error: delErr } = await supabase
      .from("user_module_access")
      .delete()
      .eq("user_id", user.id);
    if (delErr) return toast.error(delErr.message);
    if (upserts.length > 0) {
      const { error: insErr } = await supabase
        .from("user_module_access")
        .insert(upserts);
      if (insErr) return toast.error(insErr.message);
    }
    toast.success("Access updated");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Customize Access</DialogTitle>
          <DialogDescription>
            {user?.full_name ?? user?.email} — base role <span className="font-medium">{ROLE_LABEL[role]}</span>.
            Toggle individual modules below; saved as per-user overrides.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          {MODULES.map((m) => (
            <Label
              key={m}
              className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-accent"
            >
              <Checkbox
                checked={selected.has(m)}
                onCheckedChange={(c) => toggle(m, c === true)}
              />
              <span className="text-sm">{MODULE_LABEL[m]}</span>
            </Label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save Access</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
