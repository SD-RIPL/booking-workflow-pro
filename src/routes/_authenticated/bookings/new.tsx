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
import { logAudit, formatINR } from "@/lib/crm";
import type { Database } from "@/integrations/supabase/types";

type BookingInsert = Database["public"]["Tables"]["bookings"]["Insert"];

export const Route = createFileRoute("/_authenticated/bookings/new")({
  ssr: false,
  component: NewBooking,
});

function NewBooking() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<any>({
    booking_date: today,
    full_name: "", mobile: "", email: "", address: "", aadhaar_no: "",
    sales_employee: "", booking_txn_id: "", booking_gateway: "razorpay",
    booking_amount: 300, booking_gst: 54,
    notes: "",
  });
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e?.target ? e.target.value : e });

  const total = (Number(form.booking_amount) || 0) + (Number(form.booking_gst) || 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name || !form.mobile) return toast.error("Name & mobile required");
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const payload: BookingInsert = {
      booking_date: form.booking_date || null,
      full_name: form.full_name.trim(),
      mobile: form.mobile.trim(),
      email: form.email?.trim() || null,
      address: form.address?.trim() || null,
      aadhaar_no: form.aadhaar_no?.trim() || null,
      sales_employee: form.sales_employee?.trim() || null,
      booking_txn_id: form.booking_txn_id?.trim() || null,
      booking_gateway: form.booking_gateway || null,
      booking_amount: Number(form.booking_amount) || 0,
      booking_gst: Number(form.booking_gst) || 0,
      booking_total: total,
      notes: form.notes?.trim() || null,
      created_by: user.user?.id ?? null,
    };
    const { data, error } = await supabase
      .from("bookings")
      .insert(payload)
      .select()
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    await logAudit({ action: "create", module: "bookings", entity_id: (data as any).id, new_value: data });
    toast.success(`Booking ${(data as any).booking_code} created`);
    navigate({ to: "/bookings/$id", params: { id: (data as any).id } });
  }

  return (
    <>
      <PageHeader title="New Booking" description="Stage 1 — capture booking details (₹354 incl. 18% GST)" />
      <div className="p-6 max-w-4xl">
        <form onSubmit={save}>
          <Card className="p-6 space-y-6">
            <Section title="Booking">
              <Field label="Booking Date *">
                <Input type="date" required value={form.booking_date} onChange={set("booking_date")} max={today} />
              </Field>
              <Field label="Sales Employee">
                <Input value={form.sales_employee} onChange={set("sales_employee")} placeholder="Employee name" />
              </Field>
            </Section>

            <Section title="Customer">
              <Field label="Full Name *"><Input required value={form.full_name} onChange={set("full_name")} /></Field>
              <Field label="Mobile *"><Input required value={form.mobile} onChange={set("mobile")} /></Field>
              <Field label="Email"><Input type="email" value={form.email} onChange={set("email")} /></Field>
              <Field label="Aadhaar No"><Input value={form.aadhaar_no} onChange={set("aadhaar_no")} /></Field>
              <Field label="Address" full><Textarea rows={2} value={form.address} onChange={set("address")} /></Field>
            </Section>

            <Section title="Payment">
              <Field label="Booking Amount (₹)">
                <Input type="number" step="0.01" value={form.booking_amount} onChange={set("booking_amount")} />
              </Field>
              <Field label="GST 18% (₹)">
                <Input type="number" step="0.01" value={form.booking_gst} onChange={set("booking_gst")} />
              </Field>
              <Field label="Booking Transaction ID">
                <Input value={form.booking_txn_id} onChange={set("booking_txn_id")} />
              </Field>
              <Field label="Payment Received On">
                <Select value={form.booking_gateway} onValueChange={(v) => setForm({ ...form, booking_gateway: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="razorpay">Razorpay</SelectItem>
                    <SelectItem value="zoho_pay">Zoho Pay</SelectItem>
                    <SelectItem value="company_account">Company Account</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="md:col-span-2 flex items-center justify-between p-3 rounded-lg bg-muted">
                <span className="text-sm text-muted-foreground">Total Payable</span>
                <span className="text-lg font-bold tabular-nums">{formatINR(total)}</span>
              </div>
              <Field label="Notes" full><Textarea rows={2} value={form.notes} onChange={set("notes")} /></Field>
            </Section>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/bookings" })}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create Booking"}</Button>
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
