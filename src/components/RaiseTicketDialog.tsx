import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pathToModule } from "@/lib/access";
import { logAudit } from "@/lib/crm";

export function RaiseTicketFab() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const module = pathToModule(pathname) ?? "general";

  // Hide on chatbot route to avoid overlap
  if (pathname.startsWith("/chatbot")) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg h-14 w-14 p-0"
          title="Raise Ticket"
        >
          <LifeBuoy className="h-6 w-6" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise Ticket · {module}</DialogTitle>
        </DialogHeader>
        <TicketForm module={module} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TicketForm({ module, onDone }: { module: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [mobile, setMobile] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);

  const { data: customer } = useQuery({
    enabled: mobile.length >= 6,
    queryKey: ["ticket-cust-lookup", mobile],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, full_name, customer_code, mobile")
        .or(`mobile.eq.${mobile},customer_code.ilike.${mobile}`)
        .maybeSingle();
      return data;
    },
  });

  async function submit() {
    if (!subject.trim()) return toast.error("Subject required");
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        customer_id: customer?.id ?? null,
        module,
        subject,
        description: description || null,
        priority,
        raised_by: user.user?.id,
      })
      .select()
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    await supabase.from("ticket_updates").insert({
      ticket_id: ticket.id,
      author_id: user.user?.id,
      status: "open",
      remark: "Ticket raised",
    });
    await logAudit({ action: "ticket_create", module: "tickets", entity_id: ticket.id, new_value: ticket });
    toast.success(`Ticket ${ticket.ticket_code} raised`);
    qc.invalidateQueries({ queryKey: ["tickets"] });
    onDone();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Customer Mobile / Code (optional)</Label>
        <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="e.g. 98XXXXXXXX" />
        {customer && (
          <p className="text-xs text-muted-foreground">
            Linked: <span className="font-medium text-foreground">{customer.full_name}</span> ({customer.customer_code})
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Subject *</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Internet down, slow speed…" />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
      </div>
      <div className="space-y-1.5">
        <Label>Priority</Label>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Raise Ticket"}</Button>
      </DialogFooter>
    </div>
  );
}
