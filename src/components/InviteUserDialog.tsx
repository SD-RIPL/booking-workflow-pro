import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, Link2, Mail, Trash2, UserPlus } from "lucide-react";
import {
  MODULES, MODULE_LABEL, ROLE_LABEL, computeAllowedModules,
  type Module, type Role,
} from "@/lib/access";

const ROLES: Role[] = ["admin", "manager", "finance", "support", "operator"];

type InviteRow = {
  id: string;
  email: string;
  role: Role;
  token: string;
  module_overrides: Array<{ module: string; allowed: boolean }>;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
};

function inviteUrl(token: string) {
  return `${window.location.origin}/auth?invite=${token}`;
}

function statusOf(inv: InviteRow): { label: string; tone: "active" | "used" | "expired" | "revoked" } {
  if (inv.revoked_at) return { label: "Revoked", tone: "revoked" };
  if (inv.used_at) return { label: "Accepted", tone: "used" };
  if (new Date(inv.expires_at) < new Date()) return { label: "Expired", tone: "expired" };
  return { label: "Pending", tone: "active" };
}

export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("support");
  const [selected, setSelected] = useState<Set<Module>>(() => computeAllowedModules("support", []));
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const { data: invites = [], refetch } = useQuery({
    enabled: open,
    queryKey: ["invitations"],
    queryFn: async (): Promise<InviteRow[]> => {
      const { data, error } = await (supabase as any)
        .from("invitations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InviteRow[];
    },
  });

  function onRoleChange(r: Role) {
    setRole(r);
    setSelected(computeAllowedModules(r, []));
  }

  function toggleModule(m: Module, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(m); else next.delete(m);
    setSelected(next);
  }

  async function createInvite() {
    if (!email.trim()) return toast.error("Email is required");
    setCreating(true);
    const defaults = computeAllowedModules(role, []);
    const overrides: Array<{ module: string; allowed: boolean }> = [];
    for (const m of MODULES) {
      const want = selected.has(m);
      const def = defaults.has(m);
      if (want !== def) overrides.push({ module: m, allowed: want });
    }
    const { data, error } = await (supabase as any)
      .from("invitations")
      .insert({
        email: email.trim().toLowerCase(),
        role,
        module_overrides: overrides,
        note: note.trim() || null,
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      .select("token")
      .single();
    setCreating(false);
    if (error) return toast.error(error.message);
    const url = inviteUrl(data.token);
    setLastLink(url);
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success("Invite created — link copied to clipboard");
    setEmail(""); setNote("");
    refetch();
  }

  async function revoke(id: string) {
    const { error } = await (supabase as any)
      .from("invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invite revoked");
    refetch();
    qc.invalidateQueries({ queryKey: ["all-users"] });
  }

  async function copyLink(token: string) {
    const url = inviteUrl(token);
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setLastLink(null); }}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="w-4 h-4 mr-1.5" /> Invite User
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            Create an invitation link. The invitee signs up with that email and is auto-assigned the role + module access you choose here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Create form */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Email</Label>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => onRoleChange(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (<SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modules</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-2 max-h-56 overflow-auto">
                {MODULES.filter((m) => m !== "users").map((m) => (
                  <Label key={m} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-accent">
                    <Checkbox checked={selected.has(m)} onCheckedChange={(c) => toggleModule(m, c === true)} />
                    <span className="text-sm">{MODULE_LABEL[m]}</span>
                  </Label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Defaults from the selected role; toggle to customize.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-note">Note (optional)</Label>
              <Input id="inv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Finance dept — Mumbai" />
            </div>
            <Button className="w-full" onClick={createInvite} disabled={creating}>
              {creating ? "Creating…" : "Create invite & copy link"}
            </Button>
            {lastLink && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-2">
                <div className="font-medium flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Share this link</div>
                <code className="block break-all bg-background rounded px-2 py-1.5">{lastLink}</code>
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(lastLink)}>
                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy again
                </Button>
              </div>
            )}
          </div>

          {/* Existing invites */}
          <div className="space-y-2">
            <div className="text-sm font-medium flex items-center gap-1.5"><Mail className="w-4 h-4" /> Pending & past invites</div>
            <div className="rounded-md border max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">No invites yet.</TableCell></TableRow>
                  )}
                  {invites.map((inv) => {
                    const s = statusOf(inv);
                    const canRevoke = !inv.revoked_at && !inv.used_at;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="text-xs">{inv.email}</TableCell>
                        <TableCell className="text-xs">{ROLE_LABEL[inv.role]}</TableCell>
                        <TableCell>
                          <Badge
                            variant={s.tone === "active" ? "default" : "secondary"}
                            className="text-[10px]"
                          >{s.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {canRevoke && (
                              <Button size="icon" variant="ghost" title="Copy link" onClick={() => copyLink(inv.token)}>
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {canRevoke && (
                              <Button size="icon" variant="ghost" title="Revoke" onClick={() => revoke(inv.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
