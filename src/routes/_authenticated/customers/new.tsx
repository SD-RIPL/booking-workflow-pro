import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { logAudit } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/customers/new")({
  ssr: false,
  component: NewCustomer,
});

function NewCustomer() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    full_name: "", father_name: "", mobile: "", alternate_mobile: "", email: "",
    address: "", city: "", district: "", state: "", pincode: "",
    kyc_type: "aadhaar", kyc_number: "", source: "", assigned_executive: "", notes: "",
  });
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target ? e.target.value : e });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("customers").insert({
      ...form,
      activation_date: new Date().toISOString().slice(0, 10),
      created_by: user.user?.id ?? null,
    }).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    await logAudit({ action: "create", module: "customers", entity_id: data.id, new_value: data });
    toast.success(`Customer ${data.customer_code} created`);
    navigate({ to: "/customers/$id", params: { id: data.id } });
  }

  return (
    <>
      <PageHeader title="New Customer" description="Add a customer to the master database" />
      <div className="p-6 max-w-4xl">
        <form onSubmit={save}>
          <Card className="p-6 space-y-6">
            <Section title="Personal">
              <Field label="Full Name *"><Input required value={form.full_name} onChange={set("full_name")} /></Field>
              <Field label="Father Name"><Input value={form.father_name} onChange={set("father_name")} /></Field>
              <Field label="Mobile *"><Input required value={form.mobile} onChange={set("mobile")} /></Field>
              <Field label="Alternate Mobile"><Input value={form.alternate_mobile} onChange={set("alternate_mobile")} /></Field>
              <Field label="Email"><Input type="email" value={form.email} onChange={set("email")} /></Field>
            </Section>
            <Section title="Address">
              <Field label="Address" full><Textarea rows={2} value={form.address} onChange={set("address")} /></Field>
              <Field label="City"><Input value={form.city} onChange={set("city")} /></Field>
              <Field label="District"><Input value={form.district} onChange={set("district")} /></Field>
              <Field label="State"><Input value={form.state} onChange={set("state")} /></Field>
              <Field label="Pincode"><Input value={form.pincode} onChange={set("pincode")} /></Field>
            </Section>
            <Section title="KYC & Source">
              <Field label="KYC Type">
                <Select value={form.kyc_type} onValueChange={(v) => setForm({ ...form, kyc_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aadhaar">Aadhaar</SelectItem>
                    <SelectItem value="pan">PAN</SelectItem>
                    <SelectItem value="voter_id">Voter ID</SelectItem>
                    <SelectItem value="driving_license">Driving License</SelectItem>
                    <SelectItem value="passport">Passport</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="KYC Number"><Input value={form.kyc_number} onChange={set("kyc_number")} /></Field>
              <Field label="Source"><Input value={form.source} onChange={set("source")} placeholder="Referral, Online, Walk-in" /></Field>
              <Field label="Assigned Executive"><Input value={form.assigned_executive} onChange={set("assigned_executive")} /></Field>
              <Field label="Notes" full><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Field>
            </Section>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/customers" })}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create Customer"}</Button>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}
function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "md:col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
