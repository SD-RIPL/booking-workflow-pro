import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatINR, daysUntil, RECHARGE_PLANS, logAudit } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  ssr: false,
  component: CustomerDetail,
});

function CustomerDetail() {
  const { id } = useParams({ from: "/_authenticated/customers/$id" });
  const qc = useQueryClient();

  const { data: customer } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => (await supabase.from("customers").select("*").eq("id", id).maybeSingle()).data,
  });
  const { data: recharges } = useQuery({
    queryKey: ["customer-recharges", id],
    queryFn: async () => (await supabase.from("recharges").select("*").eq("customer_id", id).order("recharge_date", { ascending: false })).data ?? [],
  });
  const { data: suspensions } = useQuery({
    queryKey: ["customer-suspensions", id],
    queryFn: async () => (await supabase.from("suspensions").select("*").eq("customer_id", id).order("suspended_at", { ascending: false })).data ?? [],
  });

  if (!customer) return <div className="p-6 text-muted-foreground">Loading…</div>;
  const dl = daysUntil(customer.current_expiry_date);

  async function suspend() {
    const { data: user } = await supabase.auth.getUser();
    await supabase.from("suspensions").insert({ customer_id: id, suspended_by: user.user?.id, reason: "Manual suspension" });
    await supabase.from("customers").update({ status: "suspended" }).eq("id", id);
    await logAudit({ action: "suspend", module: "customers", entity_id: id });
    toast.success("Service suspended");
    qc.invalidateQueries({ queryKey: ["customer", id] });
    qc.invalidateQueries({ queryKey: ["customer-suspensions", id] });
  }
  async function resume() {
    const { data: user } = await supabase.auth.getUser();
    const active = suspensions?.find(s => !s.resumed_at);
    if (active) await supabase.from("suspensions").update({ resumed_at: new Date().toISOString(), resumed_by: user.user?.id }).eq("id", active.id);
    await supabase.rpc("refresh_customer_statuses");
    await logAudit({ action: "resume", module: "customers", entity_id: id });
    toast.success("Service resumed");
    qc.invalidateQueries();
  }

  return (
    <>
      <PageHeader
        title={customer.full_name}
        description={`${customer.customer_code} · ${customer.mobile}`}
        actions={
          <>
            <Link to="/customers"><Button variant="outline">Back</Button></Link>
            {customer.status === "suspended"
              ? <Button onClick={resume}>Resume Service</Button>
              : <Button variant="destructive" onClick={suspend}>Suspend</Button>}
            <NewRechargeDialog customerId={id} onDone={() => qc.invalidateQueries()} />
          </>
        }
      />
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Status</h3>
            <StatusBadge status={customer.status} />
          </div>
          <div className="text-sm space-y-1.5">
            <Row label="Expiry" value={customer.current_expiry_date ?? "—"} />
            <Row label="Days Left" value={dl?.toString() ?? "—"} />
            <Row label="Last Recharge" value={customer.last_recharge_date ?? "—"} />
            <Row label="Activation" value={customer.activation_date ?? "—"} />
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <h3 className="font-semibold mb-2">Contact</h3>
          <div className="text-sm space-y-1.5">
            <Row label="Mobile" value={customer.mobile} />
            <Row label="Alt Mobile" value={customer.alternate_mobile ?? "—"} />
            <Row label="Email" value={customer.email ?? "—"} />
            <Row label="Address" value={[customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(", ") || "—"} />
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <h3 className="font-semibold mb-2">KYC & Source</h3>
          <div className="text-sm space-y-1.5">
            <Row label="KYC Type" value={customer.kyc_type ?? "—"} />
            <Row label="KYC Number" value={customer.kyc_number ?? "—"} />
            <Row label="Source" value={customer.source ?? "—"} />
            <Row label="Executive" value={customer.assigned_executive ?? "—"} />
          </div>
        </Card>

        <Card className="lg:col-span-3 p-5">
          <h3 className="font-semibold mb-3">Recharge History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground"><tr>
                <th className="text-left py-2">ID</th><th className="text-left py-2">Date</th>
                <th className="text-left py-2">Amount</th><th className="text-left py-2">Validity</th>
                <th className="text-left py-2">Expiry</th><th className="text-left py-2">Mode</th>
              </tr></thead>
              <tbody className="divide-y">
                {(recharges ?? []).map(r => (
                  <tr key={r.id}>
                    <td className="py-2 font-mono text-xs">{r.recharge_code}</td>
                    <td className="py-2">{r.recharge_date}</td>
                    <td className="py-2 font-semibold">{formatINR(Number(r.plan_amount))}</td>
                    <td className="py-2">{r.validity_days}d</td>
                    <td className="py-2">{r.expiry_date}</td>
                    <td className="py-2 capitalize">{r.payment_mode}</td>
                  </tr>
                ))}
                {(recharges?.length ?? 0) === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No recharges yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-medium text-right">{value}</span></div>;
}

function NewRechargeDialog({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("499");
  const [validity, setValidity] = useState("25");
  const [mode, setMode] = useState("upi");
  const [txn, setTxn] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(today); expiry.setDate(today.getDate() + Number(validity));
    const { data: user } = await supabase.auth.getUser();
    const amt = Number(amount);
    const { data: rch, error } = await supabase.from("recharges").insert({
      customer_id: customerId,
      recharge_date: today.toISOString().slice(0, 10),
      plan_amount: amt,
      validity_days: Number(validity),
      expiry_date: expiry.toISOString().slice(0, 10),
      payment_mode: mode as any,
      transaction_id: txn || null,
      collected_by: user.user?.id,
    }).select().single();
    if (error) { setSaving(false); toast.error(error.message); return; }
    const gst = +(amt * 0.18 / 1.18).toFixed(2);
    await supabase.from("payments").insert({
      customer_id: customerId,
      recharge_id: rch.id,
      amount: amt - gst,
      gst,
      total_amount: amt,
      mode: mode as any,
      reference_number: txn || null,
      collected_by: user.user?.id,
    });
    await logAudit({ action: "recharge", module: "recharges", entity_id: rch.id, new_value: rch });
    setSaving(false); setOpen(false); onDone();
    toast.success("Recharge recorded");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>+ Recharge</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Recharge</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Plan Amount (₹)</Label>
            <div className="flex gap-2">
              <Select value={RECHARGE_PLANS.includes(Number(amount)) ? amount : "custom"} onValueChange={v => v !== "custom" && setAmount(v)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECHARGE_PLANS.map(p => <SelectItem key={p} value={String(p)}>₹{p}</SelectItem>)}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5"><Label>Validity (days)</Label><Input type="number" value={validity} onChange={e => setValidity(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Payment Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="qr">QR</SelectItem>
                <SelectItem value="gateway">Gateway</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Transaction / Reference</Label><Input value={txn} onChange={e => setTxn(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Recharge"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
