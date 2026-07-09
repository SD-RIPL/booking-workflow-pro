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
// Required fields (spec): Booking Date, Sales Employee Name, Mobile Number, Email, Address.
// Aadhaar is NOT collected here (moved to KYC stage, only if KYC approved).
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
    mobile: "",
    email: "",
    address: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!form.booking_date) m.push("Booking Date");
    if (!form.sales_employee.trim()) m.push("Sales Employee Name");
    if (!form.mobile.trim()) m.push("Mobile Number");
    if (!form.email.trim()) m.push("Email");
    if (!form.address.trim()) m.push("Address");
    return m;
  }, [form]);

  const canSave = missing.length === 0 && !saving;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length) return toast.error(`Please fill: ${missing.join(", ")}`);
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const payload = {
      booking_date: form.booking_date,
      sales_employee: form.sales_employee.trim(),
      full_name: form.sales_employee.trim(), // placeholder until KYC updates it
      mobile: form.mobile.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      workflow_stage: "kyc", // Save Booking -> advance to KYC (unlocks next stage)
      created_by: user.user?.id ?? null,
    };
    const { data, error } = await supabase
      .from("bookings")
      .insert(payload as never)
      .select()
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    const created = data as { id: string; booking_code: string };
    await logAudit({
      action: "create",
      module: "bookings",
      entity_id: created.id,
      new_value: data as never,
    });
    toast.success(`Booking ${created.booking_code} created — KYC unlocked`);
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
            <Field label="Booking Date *">
              <Input type="date" required value={form.booking_date} onChange={set("booking_date")} max={today} />
            </Field>
            <Field label="Sales Employee Name *">
              <Input required value={form.sales_employee} onChange={set("sales_employee")} placeholder="Employee name" />
            </Field>
            <Field label="Mobile Number *">
              <Input required value={form.mobile} onChange={set("mobile")} placeholder="10 digit mobile" />
            </Field>
            <Field label="Email *">
              <Input type="email" required value={form.email} onChange={set("email")} placeholder="name@example.com" />
            </Field>
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
                {saving ? "Saving…" : "Save Booking"}
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
