import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logAudit } from "@/lib/crm";
import { AgeCounter } from "@/components/AgeCounter";

export const Route = createFileRoute("/_authenticated/tickets")({
  ssr: false,
  component: TicketsPage,
});

const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const STATUS_COLOR: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-600",
  in_progress: "bg-amber-500/15 text-amber-600",
  resolved: "bg-emerald-500/15 text-emerald-600",
  closed: "bg-muted text-muted-foreground",
};

function TicketsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: tickets } = useQuery({
    queryKey: ["tickets", statusFilter, search],
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select("*, customers(full_name, customer_code, mobile)")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (search) q = q.or(`ticket_code.ilike.%${search}%,subject.ilike.%${search}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader title="Tickets" description="Sabhi customer support requests" />
      <div className="p-6 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="Search ticket code or subject…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Subject</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Module</th>
                <th className="text-left px-4 py-3">Priority</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Created</th>
                <th className="text-left px-4 py-3">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(tickets ?? []).map((t: any) => (
                <tr key={t.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setActiveId(t.id)}>
                  <td className="px-4 py-3 font-mono">{t.ticket_code}</td>
                  <td className="px-4 py-3 font-medium">{t.subject}</td>
                  <td className="px-4 py-3">{t.customers?.full_name ?? "—"}<div className="text-xs text-muted-foreground">{t.customers?.mobile ?? ""}</div></td>
                  <td className="px-4 py-3 capitalize">{t.module}</td>
                  <td className="px-4 py-3 capitalize">{t.priority}</td>
                  <td className="px-4 py-3"><Badge className={STATUS_COLOR[t.status]}>{t.status.replace("_", " ")}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3"><AgeCounter from={t.created_at} warnAfter={2} dangerAfter={5} /></td>
                </tr>
              ))}
              {(tickets?.length ?? 0) === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No tickets yet.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {activeId && <TicketDetailDialog id={activeId} onClose={() => setActiveId(null)} />}
    </>
  );
}

function TicketDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: ticket } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => (await supabase.from("tickets").select("*, customers(full_name, customer_code, mobile)").eq("id", id).single()).data,
  });
  const { data: updates } = useQuery({
    queryKey: ["ticket-updates", id],
    queryFn: async () => (await supabase.from("ticket_updates").select("*").eq("ticket_id", id).order("created_at")).data ?? [],
  });

  const [status, setStatus] = useState<string>("");
  const [remark, setRemark] = useState("");
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);

  async function addUpdate() {
    if (!remark.trim() && !status) return toast.error("Status ya remark dijiye");
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const newStatus = status || ticket!.status;
    await supabase.from("ticket_updates").insert({
      ticket_id: id,
      author_id: user.user?.id,
      status: newStatus,
      remark: remark || `Status changed to ${newStatus}`,
    });
    const patch: any = { status: newStatus };
    if (newStatus === "resolved" || newStatus === "closed") {
      patch.resolved_at = new Date().toISOString();
      if (resolution) patch.resolution_remark = resolution;
    }
    await supabase.from("tickets").update(patch).eq("id", id);
    await logAudit({ action: "ticket_update", module: "tickets", entity_id: id, new_value: patch });
    setSaving(false); setRemark(""); setStatus(""); setResolution("");
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["ticket-updates", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    toast.success("Update added");
  }

  if (!ticket) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono">{ticket.ticket_code}</span>
            <Badge className={STATUS_COLOR[ticket.status]}>{ticket.status.replace("_", " ")}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <div className="text-xs text-muted-foreground">Subject</div>
            <div className="font-semibold">{ticket.subject}</div>
            {ticket.description && <div className="text-sm mt-1 text-muted-foreground whitespace-pre-wrap">{ticket.description}</div>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Customer" value={ticket.customers?.full_name ?? "—"} />
            <Row label="Mobile" value={ticket.customers?.mobile ?? "—"} />
            <Row label="Module" value={ticket.module ?? "—"} />
            <Row label="Priority" value={ticket.priority ?? "—"} />
            <Row label="Created" value={new Date(ticket.created_at).toLocaleString()} />
            <Row label="Resolved" value={ticket.resolved_at ? new Date(ticket.resolved_at).toLocaleString() : "—"} />
          </div>
          {ticket.resolution_remark && (
            <div className="rounded border p-3 bg-emerald-500/5">
              <div className="text-xs text-muted-foreground">Resolution</div>
              <div className="text-sm">{ticket.resolution_remark}</div>
            </div>
          )}

          <div>
            <div className="text-sm font-semibold mb-2">Timeline</div>
            <div className="space-y-2">
              {(updates ?? []).map((u: any) => (
                <div key={u.id} className="border-l-2 pl-3 py-1">
                  <div className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString()} · <span className="capitalize">{u.status?.replace("_", " ")}</span></div>
                  <div className="text-sm">{u.remark}</div>
                </div>
              ))}
              {(updates?.length ?? 0) === 0 && <div className="text-xs text-muted-foreground">No updates yet.</div>}
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="text-sm font-semibold">Add Update</div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Change status…" /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Textarea placeholder="Processing remark…" value={remark} onChange={(e) => setRemark(e.target.value)} />
            {(status === "resolved" || status === "closed") && (
              <div className="space-y-1.5">
                <Label className="text-xs">Resolution summary (saved on ticket)</Label>
                <Input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Issue resolved by…" />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={addUpdate} disabled={saving}>{saving ? "Saving…" : "Add Update"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium capitalize">{value}</div></div>;
}
