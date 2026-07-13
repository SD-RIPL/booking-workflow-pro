import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Undo2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/routers")({
  ssr: false,
  component: RoutersPage,
});

function RoutersPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["routers"],
    queryFn: async () => (await supabase.from("routers").select("*, customers(id, full_name, customer_code)").is("deleted_at", null).order("created_at", { ascending: false })).data ?? [],
  });

  const counts = (data ?? []).reduce((acc: Record<string, number>, r: any) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader title="Router Management" description={`${data?.length ?? 0} routers`} actions={<NewRouter onDone={() => qc.invalidateQueries({ queryKey: ["routers"] })} />} />
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {["in_stock","assigned","installed","returned","faulty"].map((k) => (
            <Card key={k} className="p-3">
              <div className="text-xs text-muted-foreground capitalize">{k.replace("_"," ")}</div>
              <div className="text-2xl font-bold tabular-nums">{counts[k] ?? 0}</div>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>
                <th className="text-left px-4 py-3">Serial Number</th><th className="text-left px-4 py-3">Model</th>
                <th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Condition</th>
                <th className="text-left px-4 py-3">Assigned To</th><th className="text-left px-4 py-3">Installed</th>
                <th className="text-left px-4 py-3">Return Date</th><th className="text-right px-4 py-3">Actions</th>
              </tr></thead>
              <tbody className="divide-y">
                {data?.map((r: any) => (
                  <tr key={r.id} className="hover:bg-accent/30">
                    <td className="px-4 py-3 font-mono text-xs">{r.serial_number}</td>
                    <td className="px-4 py-3">{r.model ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      {r.condition === "refurbished"
                        ? <Badge variant="outline" className="border-amber-400 text-amber-700">Refurbished</Badge>
                        : (r.condition ?? "—")}
                    </td>
                    <td className="px-4 py-3">{r.customers?.full_name ?? "—"}</td>
                    <td className="px-4 py-3">{r.installation_date ?? "—"}</td>
                    <td className="px-4 py-3">{r.return_date ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {r.customers?.id && (r.status === "assigned" || r.status === "installed") && (
                        <ReturnDialog
                          customerId={r.customers.id}
                          customerName={r.customers.full_name}
                          serial={r.serial_number}
                          onDone={() => {
                            qc.invalidateQueries({ queryKey: ["routers"] });
                            qc.invalidateQueries({ queryKey: ["sims"] });
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
                {(data?.length ?? 0) === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No routers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function ReturnDialog({ customerId, customerName, serial, onDone }: { customerId: string; customerName: string; serial: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState<"refurbished" | "faulty">("refurbished");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const { error } = await (supabase as any).rpc("return_router_and_deactivate_sim", {
      _customer: customerId, _reason: reason || null, _condition: condition,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Router returned → back to stock (refurbished). SIM deactivated.");
    setOpen(false); setReason("");
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Undo2 className="w-3.5 h-3.5 mr-1" />Return</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return Router from {customerName}</DialogTitle>
          <DialogDescription>
            The router (<span className="font-mono">{serial}</span>) will go back to stock and be marked as <b>{condition}</b>.
            The customer's SIM will be <b>deactivated</b> (SIMs are not returned to the telco).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Condition</Label>
            <div className="flex gap-2">
              {(["refurbished","faulty"] as const).map((c) => (
                <Button key={c} size="sm" variant={condition === c ? "default" : "outline"} onClick={() => setCondition(c)}>
                  {c === "refurbished" ? "Refurbished (reusable)" : "Faulty (repair/scrap)"}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason / Notes</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. customer relocated, service cancelled" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Processing…" : "Confirm Return"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewRouter({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [serial, setSerial] = useState("");
  const [model, setModel] = useState("");
  async function save() {
    const { error } = await supabase.from("routers").insert({ serial_number: serial, model });
    if (error) return toast.error(error.message);
    toast.success("Router added");
    setOpen(false); setSerial(""); setModel(""); onDone();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Add Router</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Router</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Serial Number *</Label><Input value={serial} onChange={e => setSerial(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Model</Label><Input value={model} onChange={e => setModel(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
