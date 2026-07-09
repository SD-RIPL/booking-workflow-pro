import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { logAudit, formatINR } from "@/lib/crm";
import { Check, Lock, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bookings/$id")({
  ssr: false,
  component: BookingDetail,
});

const STAGES = [
  "booking",
  "kyc_verification",
  "kyc_mail",
  "security_deposit",
  "payment",
  "dispatch",
  "activation",
  "customer",
] as const;

const STAGE_LABEL: Record<string, string> = {
  booking: "Booking",
  kyc_verification: "KYC Verification",
  kyc_mail: "KYC Mail",
  security_deposit: "Security Deposit",
  payment: "Payment",
  dispatch: "Dispatch",
  activation: "Activation",
  customer: "Customer",
};

function daysBetween(a?: string | null, b?: string | null) {
  if (!a) return null;
  const start = new Date(a + (a.length === 10 ? "T00:00:00" : ""));
  const end = b ? new Date(b + (b.length === 10 ? "T00:00:00" : "")) : new Date();
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function BookingDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: b, isLoading } = useQuery({
    queryKey: ["booking", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings" as any)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (b) setForm(b); }, [b]);

  if (isLoading || !form) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  async function patch(fields: Record<string, any>, successMsg: string) {
    const { error } = await supabase
      .from("bookings" as any)
      .update(fields)
      .eq("id", id);
    if (error) return toast.error(error.message);

    const { data: refreshed } = await supabase
      .from("bookings" as any)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    await logAudit({ action: "update", module: "bookings", entity_id: id, old_value: b, new_value: refreshed });
    toast.success(successMsg);
    if (refreshed) setForm(refreshed);
    qc.invalidateQueries({ queryKey: ["booking", id] });
    qc.invalidateQueries({ queryKey: ["bookings-list"] });
  }

  // ─── Sequential unlock logic ───────────────────────────────────────────────
  // IMPORTANT: unlock gates read from the SAVED row `b`, not the local `form`.
  // Changing a dropdown must NOT unlock the next stage — only a successful
  // Save (which refetches into `b`) can.
  const saved = b as any;
  const kycVerificationDone = saved.kyc_verification === "approved";

  const kycMailUnlocked = kycVerificationDone;
  const kycMailDone = kycMailUnlocked && saved.kyc_mail_status === "sent";

  const sdUnlocked = kycMailDone;
  const sdDone = sdUnlocked && saved.sd_status === "received";
  const sdCancelled = sdUnlocked && saved.sd_status === "cancel_booking";

  const paymentUnlocked = sdDone;
  const paymentModePrepaid = saved.payment_mode === "prepaid";
  const paymentModeCOD = saved.payment_mode === "cod";
  const codDeliveryReceived = saved.cod_delivery_status === "received";
  const paymentDone = paymentUnlocked && (
    paymentModePrepaid ||
    (paymentModeCOD && codDeliveryReceived)
  );

  const dispatchUnlocked = paymentDone;
  const dispatchDone = dispatchUnlocked && saved.dispatch_status === "delivered";

  const activationUnlocked = dispatchDone;
  const activationDone = activationUnlocked && saved.activation_status === "active";
  const customerUnlocked = activationDone;
  const customerCreated = !!saved.customer_id;

  const isCancelled = sdCancelled || saved.current_stage === "cancelled";


  const currentStepIdx = (() => {
    if (!kycVerificationDone) return 1;
    if (!kycMailDone) return 2;
    if (!sdDone) return 3;
    if (!paymentDone) return 4;
    if (!dispatchDone) return 5;
    if (!activationDone) return 6;
    if (!customerCreated) return 7;
    return 8;
  })();

  const daysSinceBooking = daysBetween(form.booking_date);
  const daysBookingToSd = daysBetween(form.booking_date, form.sd_received_date);

  return (
    <>
      <PageHeader
        title={`Booking ${form.booking_code}`}
        description={`${form.full_name} • ${form.mobile}`}
        actions={<Button variant="outline" onClick={() => navigate({ to: "/bookings" })}>Back</Button>}
      />

      <div className="p-6 space-y-6 max-w-5xl">
        {/* Stepper */}
        <Card className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            {STAGES.map((s, i) => {
              const done = i < currentStepIdx;
              const current = i === currentStepIdx;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    done ? "bg-success text-success-foreground" :
                    current ? "bg-primary text-primary-foreground" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {done ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-sm ${current ? "font-semibold" : "text-muted-foreground"}`}>{STAGE_LABEL[s]}</span>
                  {i < STAGES.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              );
            })}
            {isCancelled && <Badge variant="destructive">Cancelled</Badge>}
          </div>
          <div className="flex gap-6 text-xs text-muted-foreground mt-4">
            <div>Booking ko <span className="font-semibold text-foreground">{daysSinceBooking}</span> din ho gaye</div>
            {daysBookingToSd != null && (
              <div>Booking ke <span className="font-semibold text-foreground">{daysBookingToSd}</span> din baad SD aaya</div>
            )}
          </div>
        </Card>

        {/* Stage 1 — Booking summary */}
        <SectionCard title="1. Booking Details" tone="done">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <Info label="Booking Date" value={form.booking_date} />
            <Info label="Sales Employee" value={form.sales_employee} />
            <Info label="Transaction ID" value={form.booking_txn_id} />
            <Info label="Payment Gateway" value={form.booking_gateway} />
            <Info label="Booking Amount" value={formatINR(Number(form.booking_amount))} />
            <Info label="GST + Total" value={`${formatINR(Number(form.booking_gst))} → ${formatINR(Number(form.booking_total))}`} />
            <Info label="Email" value={form.email} />
            <Info label="Aadhaar" value={form.aadhaar_no} />
            <Info label="Address" value={form.address} />
          </div>
        </SectionCard>

        {/* Stage 2 — KYC Verification */}
        <SectionCard
          title="2. KYC Verification"
          tone={kycVerificationDone ? "done" : "current"}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="KYC Verification">
              <Select value={form.kyc_verification ?? ""} onValueChange={(v) => set("kyc_verification", v)}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="not_approved">Not Approved</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {form.kyc_verification === "not_approved" && (
            <p className="text-sm text-destructive mt-3">KYC approved nahi hai — aage ke sab stages disabled hain.</p>
          )}
          <div className="flex justify-end mt-3">
            <Button size="sm" onClick={() => patch({ kyc_verification: form.kyc_verification }, "KYC Verification updated")}>
              Save KYC Verification
            </Button>
          </div>
        </SectionCard>

        {/* Stage 3 — KYC Mail Status */}
        <SectionCard
          title="3. KYC Mail Status"
          tone={!kycMailUnlocked ? "locked" : kycMailDone ? "done" : "current"}
          locked={!kycMailUnlocked}
        >
          {!kycMailUnlocked ? (
            <p className="text-sm text-muted-foreground">KYC Verification approved hone ke baad unlock hoga.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="KYC Mail Status">
                  <Select value={form.kyc_mail_status ?? ""} onValueChange={(v) => set("kyc_mail_status", v)}>
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_sent">Not Sent</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {form.kyc_mail_status === "not_sent" && (
                <p className="text-sm text-muted-foreground mt-3">KYC mail send hone ke baad Security Deposit unlock hoga.</p>
              )}
              <div className="flex justify-end mt-3">
                <Button size="sm" onClick={() => patch({ kyc_mail_status: form.kyc_mail_status }, "KYC Mail Status updated")}>
                  Save KYC Mail
                </Button>
              </div>
            </>
          )}
        </SectionCard>

        {/* Stage 4 — Security Deposit */}
        <SectionCard
          title="4. Security Deposit"
          tone={!sdUnlocked ? "locked" : sdDone ? "done" : "current"}
          locked={!sdUnlocked}
        >
          {!sdUnlocked ? (
            <p className="text-sm text-muted-foreground">KYC mail sent hone ke baad unlock hoga.</p>
          ) : sdCancelled ? (
            <p className="text-sm text-destructive">Booking cancel kar di gayi hai. Aage koi stage available nahi hai.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="SD Amount">
                  <Select value={form.sd_amount?.toString() ?? ""} onValueChange={(v) => set("sd_amount", Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Select amount" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1770">₹1,770.00</SelectItem>
                      <SelectItem value="2063.82">₹2,063.82</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="SD Status">
                  <Select value={form.sd_status ?? ""} onValueChange={(v) => set("sd_status", v)}>
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_received">Not Received</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="hold">Hold</SelectItem>
                      <SelectItem value="cancel_booking">Cancel Booking</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {form.sd_status === "received" && (
                  <>
                    <Field label="SD Received Date">
                      <Input type="date" value={form.sd_received_date ?? ""} onChange={(e) => set("sd_received_date", e.target.value)} />
                    </Field>
                    <Field label="SD Transaction ID">
                      <Input value={form.sd_txn_id ?? ""} onChange={(e) => set("sd_txn_id", e.target.value)} />
                    </Field>
                    <Field label="SD Payment Received (₹)">
                      <Input type="number" step="0.01" value={form.sd_payment_received ?? ""} onChange={(e) => set("sd_payment_received", e.target.value)} />
                    </Field>
                    <Field label="Received On">
                      <Select value={form.sd_received_on ?? ""} onValueChange={(v) => set("sd_received_on", v)}>
                        <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="razorpay">Razorpay</SelectItem>
                          <SelectItem value="zoho_pay">Zoho Pay</SelectItem>
                          <SelectItem value="company_account">Company Account</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}
              </div>
              {(form.sd_status === "not_received" || form.sd_status === "hold") && (
                <p className="text-sm text-muted-foreground mt-3">
                  {form.sd_status === "hold"
                    ? "SD hold par hai — Payment stage disabled rahega."
                    : "SD receive hone ke baad Payment stage unlock hoga."}
                </p>
              )}
              <div className="flex justify-end mt-3">
                <Button size="sm" onClick={() => patch({
                  sd_amount: form.sd_amount,
                  sd_status: form.sd_status,
                  sd_received_date: form.sd_received_date,
                  sd_txn_id: form.sd_txn_id,
                  sd_payment_received: form.sd_payment_received,
                  sd_received_on: form.sd_received_on,
                }, "Security deposit updated")}>Save SD</Button>
              </div>
            </>
          )}
        </SectionCard>

        {/* Stage 5 — Payment Mode */}
        <SectionCard
          title="5. Payment Mode"
          tone={!paymentUnlocked ? "locked" : paymentDone ? "done" : "current"}
          locked={!paymentUnlocked}
        >
          {!paymentUnlocked ? (
            <p className="text-sm text-muted-foreground">Security deposit receive hone ke baad unlock hoga.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Payment Mode">
                  <Select value={form.payment_mode ?? ""} onValueChange={(v) => set("payment_mode", v)}>
                    <SelectTrigger><SelectValue placeholder="Select payment mode" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prepaid">Prepaid</SelectItem>
                      <SelectItem value="cod">COD</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {paymentModeCOD && (
                  <>
                    <Field label="Delivery Charge">
                      <Input value="₹300" readOnly className="bg-muted text-muted-foreground cursor-not-allowed" />
                    </Field>
                    <Field label="Delivery Charge Status">
                      <Select value={form.cod_delivery_status ?? ""} onValueChange={(v) => set("cod_delivery_status", v)}>
                        <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_received">Not Received</SelectItem>
                          <SelectItem value="received">Received</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {codDeliveryReceived && (
                      <>
                        <Field label="Delivery Charge Transaction ID">
                          <Input
                            value={form.cod_delivery_txn_id ?? ""}
                            onChange={(e) => set("cod_delivery_txn_id", e.target.value)}
                            placeholder="Transaction ID"
                          />
                        </Field>
                        <Field label="Delivery Charge Received Date">
                          <Input
                            type="date"
                            value={form.cod_delivery_received_date ?? ""}
                            onChange={(e) => set("cod_delivery_received_date", e.target.value)}
                          />
                        </Field>
                      </>
                    )}
                  </>
                )}
              </div>
              {paymentModeCOD && form.cod_delivery_status === "not_received" && (
                <p className="text-sm text-muted-foreground mt-3">Delivery charge receive hone ke baad Dispatch unlock hoga.</p>
              )}
              {paymentModePrepaid && (
                <p className="text-sm text-success mt-3">Prepaid selected — Dispatch section ab unlock hai.</p>
              )}
              <div className="flex justify-end mt-3">
                <Button size="sm" onClick={() => patch({
                  payment_mode: form.payment_mode,
                  cod_delivery_status: form.cod_delivery_status,
                  cod_delivery_txn_id: form.cod_delivery_txn_id,
                  cod_delivery_received_date: form.cod_delivery_received_date,
                }, "Payment mode updated")}>Save Payment</Button>
              </div>
            </>
          )}
        </SectionCard>

        {/* Stage 6 — Dispatch & Router */}
        <SectionCard
          title="6. Dispatch & Router Config"
          tone={!dispatchUnlocked ? "locked" : dispatchDone ? "done" : "current"}
          locked={!dispatchUnlocked}
        >
          {!dispatchUnlocked ? (
            <p className="text-sm text-muted-foreground">Payment complete hone ke baad unlock hoga.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Dispatch Status">
                  <Select value={form.dispatch_status ?? ""} onValueChange={(v) => set("dispatch_status", v)}>
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="dispatched">Dispatched</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Dispatched At">
                  <Input type="date" value={form.dispatched_at ?? ""} onChange={(e) => set("dispatched_at", e.target.value)} />
                </Field>
              </div>
              <h4 className="text-sm font-semibold mt-5 mb-2 text-muted-foreground uppercase tracking-wide">Router / SIM</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Router Company">
                  <Input value={form.router_company ?? ""} onChange={(e) => set("router_company", e.target.value)} />
                </Field>
                <Field label="Router Model No">
                  <Input value={form.router_model_no ?? ""} onChange={(e) => set("router_model_no", e.target.value)} />
                </Field>
                <Field label="Sim Company">
                  <Input value={form.sim_company ?? ""} onChange={(e) => set("sim_company", e.target.value)} />
                </Field>
                <Field label="Router Sim No">
                  <Input value={form.router_sim_no ?? ""} onChange={(e) => set("router_sim_no", e.target.value)} />
                </Field>
                <Field label="Router Sim Card No">
                  <Input value={form.router_sim_card_no ?? ""} onChange={(e) => set("router_sim_card_no", e.target.value)} />
                </Field>
                <Field label="Router IMEI / MAC No">
                  <Input value={form.router_imei_mac ?? ""} onChange={(e) => set("router_imei_mac", e.target.value)} />
                </Field>
                <Field label="Router IMEI WAVLINK">
                  <Input value={form.router_imei_wavlink ?? ""} onChange={(e) => set("router_imei_wavlink", e.target.value)} />
                </Field>
                <Field label="SIM Activation Status">
                  <Select value={form.sim_activation_status ?? ""} onValueChange={(v) => set("sim_activation_status", v)}>
                    <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {(form.dispatch_status === "pending" || form.dispatch_status === "dispatched") && (
                <p className="text-sm text-muted-foreground mt-3">Activation tab unlock hogi jab Dispatch Status = Delivered hoga.</p>
              )}
              <div className="flex justify-end mt-3">
                <Button size="sm" onClick={() => patch({
                  dispatch_status: form.dispatch_status,
                  dispatched_at: form.dispatched_at,
                  router_company: form.router_company,
                  router_model_no: form.router_model_no,
                  sim_company: form.sim_company,
                  router_sim_no: form.router_sim_no,
                  router_sim_card_no: form.router_sim_card_no,
                  router_imei_mac: form.router_imei_mac,
                  router_imei_wavlink: form.router_imei_wavlink,
                  sim_activation_status: form.sim_activation_status,
                }, "Dispatch & router updated")}>Save Dispatch</Button>
              </div>
            </>
          )}
        </SectionCard>

        {/* Stage 7 — Activation */}
        <SectionCard
          title="7. Activation"
          tone={!activationUnlocked ? "locked" : form.activation_status === "active" ? "done" : "current"}
          locked={!activationUnlocked}
        >
          {!activationUnlocked ? (
            <p className="text-sm text-muted-foreground">Dispatch status "Delivered" hone ke baad unlock hoga.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Activation Date">
                  <Input type="date" value={form.activation_date ?? ""} onChange={(e) => set("activation_date", e.target.value)} />
                </Field>
                <Field label="Activation Status">
                  <Select value={form.activation_status ?? ""} onValueChange={(v) => set("activation_status", v)}>
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Activation Notes">
                  <Input value={form.activation_notes ?? ""} onChange={(e) => set("activation_notes", e.target.value)} placeholder="Optional notes" />
                </Field>
              </div>
              <div className="flex justify-end mt-3">
                <Button size="sm" onClick={() => patch({
                  activation_date: form.activation_date,
                  activation_status: form.activation_status,
                  activation_notes: form.activation_notes,
                }, "Activation updated")}>Save Activation</Button>
              </div>
            </>
          )}
        </SectionCard>

        {/* Stage 8 — Customer Creation */}
        <SectionCard
          title="8. Customer Creation"
          tone={!customerUnlocked ? "locked" : customerCreated ? "done" : "current"}
          locked={!customerUnlocked}
        >
          {!customerUnlocked ? (
            <p className="text-sm text-muted-foreground">SIM Activation "Active" hone ke baad customer create kar sakte hain.</p>
          ) : customerCreated ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-success">Customer already create ho chuka hai.</p>
              <Button size="sm" variant="outline" onClick={() => navigate({ to: "/customers/$id", params: { id: form.customer_id } })}>
                Open Customer
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                Sab stages complete ho chuke hain. Customer create karne se booking Customers module me move ho jayegi
                aur Recharge / Payment / Support enable ho jayenge.
              </p>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!kycVerificationDone || !kycMailDone || !sdDone || !paymentDone || !dispatchDone || !activationDone) {
                      return toast.error("Pehle saare stages complete karein");
                    }
                    const { data: user } = await supabase.auth.getUser();
                    const { data: cust, error: cErr } = await supabase
                      .from("customers")
                      .insert({
                        booking_id: form.id,
                        full_name: form.full_name,
                        father_name: form.father_name ?? null,
                        mobile: form.mobile,
                        alternate_mobile: form.alternate_mobile ?? null,
                        email: form.email ?? null,
                        address: form.address ?? null,
                        address_line: form.address_line ?? form.address ?? null,
                        city: form.city ?? null,
                        district: form.district ?? null,
                        state: form.state ?? null,
                        pincode: form.pincode ?? null,
                        kyc_type: form.kyc_type ?? "aadhaar",
                        kyc_number: form.kyc_number ?? form.aadhaar_no ?? null,
                        source: form.source ?? null,
                        router_id: form.router_id ?? null,
                        sim_id: form.sim_id ?? null,
                        activation_date: form.activation_date ?? new Date().toISOString().slice(0, 10),
                        notes: form.notes ?? null,
                      } as any)
                      .select()
                      .single();
                    if (cErr) return toast.error(cErr.message);
                    await patch({ customer_id: (cust as any).id, current_stage: "active" }, `Customer ${(cust as any).customer_code} created`);
                    await logAudit({ action: "create", module: "customers", entity_id: (cust as any).id, new_value: cust });
                    navigate({ to: "/customers/$id", params: { id: (cust as any).id } });
                  }}
                >
                  Create Customer
                </Button>
              </div>
            </>
          )}
        </SectionCard>



        {/* Notes */}
        <Card className="p-4">
          <Field label="Notes">
            <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <div className="flex justify-end mt-3">
            <Button variant="outline" size="sm" onClick={() => patch({ notes: form.notes }, "Notes saved")}>Save Notes</Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function SectionCard({ title, children, tone, locked }: { title: string; children: React.ReactNode; tone: "done" | "current" | "locked"; locked?: boolean }) {
  const ring = tone === "done" ? "border-success/40" : tone === "current" ? "border-primary/40" : "border-border";
  return (
    <Card className={`p-5 border-2 ${ring} ${locked ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-semibold">{title}</h3>
        {locked && <Lock className="w-4 h-4 text-muted-foreground" />}
        {tone === "done" && !locked && <Badge className="bg-success/15 text-success" variant="secondary">Done</Badge>}
        {tone === "current" && !locked && <Badge variant="secondary">Current</Badge>}
      </div>
      {children}
    </Card>
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

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value || "—"}</div>
    </div>
  );
}
