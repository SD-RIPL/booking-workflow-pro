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
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/routers")({
  ssr: false,
  component: RoutersPage,
});

function RoutersPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["routers"],
    queryFn: async () => (await supabase.from("routers").select("*, customers(full_name)").is("deleted_at", null).order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <>
      <PageHeader title="Router Management" description={`${data?.length ?? 0} routers`} actions={<NewRouter onDone={() => qc.invalidateQueries({ queryKey: ["routers"] })} />} />
      <div className="p-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>
                <th className="text-left px-4 py-3">Serial Number</th><th className="text-left px-4 py-3">Model</th>
                <th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Assigned To</th>
                <th className="text-left px-4 py-3">Installed</th>
              </tr></thead>
              <tbody className="divide-y">
                {data?.map((r: any) => (
                  <tr key={r.id} className="hover:bg-accent/30">
                    <td className="px-4 py-3 font-mono text-xs">{r.serial_number}</td>
                    <td className="px-4 py-3">{r.model ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">{r.customers?.full_name ?? "—"}</td>
                    <td className="px-4 py-3">{r.installation_date ?? "—"}</td>
                  </tr>
                ))}
                {(data?.length ?? 0) === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No routers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
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
