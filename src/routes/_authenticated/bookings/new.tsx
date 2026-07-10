import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { logAudit } from "@/lib/crm";

// STAGE 1 — Booking
// Required: Booking Date, Sales Employee, Full Name, Mobile, Email, Address, Booking Amount.
// Aadhaar is collected later (KYC stage) only when KYC is Approved.
export const Route = createFileRoute("/_authenticated/bookings/new")({
  ssr: false,
  component: NewBooking,
});

function NewBooking() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    booking_date: today,
    sales_employee: "",
    full_name: "",
    mobile: "",
    email: "",
    address: "",
    booking_amount: "",
    booking_txn_id: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!form.booking_date) m.push("Booking Date");
    if (!form.sales_employee.trim()) m.push("Sales Employee");
    if (!form.full_name.trim()) m.push("Full Name");
    if (!form.mobile.trim()) m.push("Mobile");
    if (!form.email.trim()) m.push("Email");
    if (!form.address.trim()) m.push("Address");
    if (!form.booking_amount || Number(form.booking_amount) <= 0) m.push("Booking Amount");
    return m;
  }, [form]);

  const canSave = missing.length === 0 && !saving;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length) return toast.error(`Please fill: ${missing.join(", ")}`);
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();

    // Step 1: INSERT must start at workflow_stage='booking' (DB trigger enforces this).
    const insertPayload = {
      booking_date: form.booking_date,
      sales_employee: form.sales_employee.trim(),
      full_name: form.full_name.trim(),
      mobile: form.mobile.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      booking_amount: Number(form.booking_amount),
      booking_txn_id: form.booking_txn_id.trim() || null,
      workflow_stage: "booking",
      created_by: user.user?.id ?? null,
    };
    const { data: inserted, error: insErr } = await supabase
      .from("bookings")
      .insert(insertPayload as never)
      .select()
      .single();
    if (insErr) {
      setSaving(false);
      return toast.error(insErr.message);
    }
    const created = inserted as { id: string; booking_code: string };

    // Step 2: advance to 'kyc' (unlocks next stage). Trigger validates required booking fields.
    const { error: upErr } = await supabase
      .from("bookings")
      .update({ workflow_stage: "kyc" } as never)
      .eq("id", created.id);
    setSaving(false);
    if (upErr) {
      toast.error(`Saved, but couldn't advance to KYC: ${upErr.message}`);
    } else {
      toast.success(`Booking ${created.booking_code} created — KYC unlocked`);
    }
    await logAudit({
      action: "create",
      module: "bookings",
      entity_id: created.id,
      new_value: inserted as never,
    });
    navigate({ to: "/bookings/$id", params: { id: created.id } });
  }

  return (
    <>
      <PageHeader
        title="New Booking"
        description="Stage 1 of 6 — Booking → KYC → Security Deposit → Router Config → Dispatch → Activation"
      />
      <div className="p-6 max-w-3xl">
        <form onSubmit={save}>
          <Card className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Booking Date *">
                <Input type="date" required value={form.booking_date} onChange={set("booking_date")} max={today} />
              </Field>
              <Field label="Sales Employee *">
                <Input required value={form.sales_employee} onChange={set("sales_employee")} placeholder="Employee name" />
              </Field>
              <Field label="Customer Full Name *">
                <Input required value={form.full_name} onChange={set("full_name")} placeholder="Customer full name" />
              </Field>
              <Field label="Mobile Number *">
                <Input required value={form.mobile} onChange={set("mobile")} placeholder="10-digit mobile" />
              </Field>
              <Field label="Email *">
                <Input type="email" required value={form.email} onChange={set("email")} placeholder="name@example.com" />
              </Field>
              <Field label="Booking Amount (₹) *">
                <Input type="number" min="1" step="0.01" required value={form.booking_amount} onChange={set("booking_amount")} placeholder="e.g. 354" />
              </Field>
              <Field label="Booking Txn / Reference ID">
                <Input value={form.booking_txn_id} onChange={set("booking_txn_id")} placeholder="Optional at booking stage" />
              </Field>
            </div>
            <Field label="Address *">
              <Textarea required rows={3} value={form.address} onChange={set("address")} placeholder="Full address" />
            </Field>

            {missing.length > 0 && (
              <div className="text-xs text-destructive">Required to save: {missing.join(", ")}</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/bookings" })}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave}>
                {saving ? "Saving…" : "Save Booking & Continue to KYC"}
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
