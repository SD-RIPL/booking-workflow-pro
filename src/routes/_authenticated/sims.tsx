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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sims")({
  ssr: false,
  component: SimsPage,
});

function SimsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["sims"],
    queryFn: async () => (await supabase.from("sims").select("*, customers(full_name, customer_code)").order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <>
      <PageHeader title="SIM Management" description={`${data?.length ?? 0} SIMs`} actions={<NewSim onDone={() => qc.invalidateQueries({ queryKey: ["sims"] })} />} />
      <div className="p-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>
                <th className="text-left px-4 py-3">SIM Number</th><th className="text-left px-4 py-3">Packet</th>
                <th className="text-left px-4 py-3">Company</th><th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Assigned To</th><th className="text-left px-4 py-3">Activated</th>
              </tr></thead>
              <tbody className="divide-y">
                {data?.map((s: any) => (
                  <tr key={s.id} className="hover:bg-accent/30">
                    <td className="px-4 py-3 font-mono text-xs">{s.sim_number}</td>
                    <td className="px-4 py-3">{s.packet_number ?? "—"}</td>
                    <td className="px-4 py-3 uppercase font-medium">{s.company}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3">{s.customers?.full_name ?? "—"}</td>
                    <td className="px-4 py-3">{s.activation_date ?? "—"}</td>
                  </tr>
                ))}
                {(data?.length ?? 0) === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No SIMs yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function NewSim({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [sim_number, setSim] = useState("");
  const [packet_number, setPacket] = useState("");
  const [company, setCompany] = useState("airtel");
  async function save() {
    const { error } = await supabase.from("sims").insert({ sim_number, packet_number, company: company as any });
    if (error) return toast.error(error.message);
    toast.success("SIM added");
    setOpen(false); setSim(""); setPacket(""); onDone();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Add SIM</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add SIM</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>SIM Number *</Label><Input value={sim_number} onChange={e => setSim(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Packet Number</Label><Input value={packet_number} onChange={e => setPacket(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Company</Label>
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="airtel">Airtel</SelectItem><SelectItem value="vi">Vi</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
