import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { logAudit } from "@/lib/crm";
import { Check, Lock, ChevronRight, Pencil } from "lucide-react";
import { useAccess } from "@/lib/access";

const EditModeCtx = createContext(false);
const useEditMode = () => useContext(EditModeCtx);

export const Route = createFileRoute("/_authenticated/bookings/$id")({
  ssr: false,
  component: BookingDetail,
});

// ============================================================
// Sequential Booking Workflow (strict lock)
// booking -> kyc -> deposit -> router_config -> dispatch -> activation -> completed
// Customer is auto-created by the DB when deposit -> router_config advances.
// ============================================================

const STAGES = ["booking", "kyc", "deposit", "router_config", "dispatch", "activation", "completed"] as const;
type Stage = (typeof STAGES)[number];
const STAGE_LABEL: Record<Stage, string> = {
  booking: "Booking",
  kyc: "KYC Verification",
  deposit: "Security Deposit",
  router_config: "Router Configuration",
  dispatch: "Dispatch",
  activation: "Activation",
  completed: "Completed",
};

function ageInDays(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const start = new Date(dateStr.length === 10 ? dateStr + "T00:00:00" : dateStr);
  const diff = Math.floor((Date.now() - start.getTime()) / 86400000);
  return Math.max(0, diff);
}

function ageLabel(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days`;
}

function stageIndex(s: string | null | undefined): number {
  const i = STAGES.indexOf((s ?? "booking") as Stage);
  return i < 0 ? 0 : i;
}

function BookingDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: b, isLoading } = useQuery({
    queryKey: ["booking", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading || !b) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const currentIdx = stageIndex(b.workflow_stage);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["booking", id] });
  }

  async function save(fields: Record<string, unknown>, advanceTo: Stage | null, successMsg: string) {
    const patch: Record<string, unknown> = { ...fields };
    if (advanceTo) patch.workflow_stage = advanceTo;
    const { error } = await supabase.from("bookings").update(patch as never).eq("id", id);
    if (error) {
      // Trigger errors bubble up here — display readable message
      toast.error(error.message.replace(/^ERROR:\s*/i, ""));
      return false;
    }
    await logAudit({
      action: advanceTo ? `advance_to_${advanceTo}` : "update",
      module: "bookings",
      entity_id: id,
      new_value: patch as never,
    });
    toast.success(successMsg);
    await refresh();
    return true;
  }

  return (
    <>
      <PageHeader
        title={`Booking ${b.booking_code}`}
        description="Enterprise workflow — each stage unlocks only after the previous Save succeeds"
        actions={
          <Button variant="outline" onClick={() => navigate({ to: "/bookings" })}>
            Back to list
          </Button>
        }
      />

      <div className="p-6 space-y-4 max-w-5xl">
        {/* Progress rail */}
        <Card className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
            {STAGES.filter((s) => s !== "completed").map((s, i) => {
              const done = i < currentIdx;
              const current = i === currentIdx;
              return (
                <div key={s} className="flex items-center gap-2">
                  <Badge
                    variant={done ? "default" : current ? "secondary" : "outline"}
                    className={done ? "bg-emerald-600 hover:bg-emerald-600" : ""}
                  >
                    {done ? <Check className="w-3 h-3 mr-1" /> : current ? null : <Lock className="w-3 h-3 mr-1" />}
                    {i + 1}. {STAGE_LABEL[s]}
                  </Badge>
                  {i < STAGES.length - 2 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                </div>
              );
            })}
            {b.workflow_stage === "completed" && (
              <Badge className="bg-emerald-600 hover:bg-emerald-600 ml-2">
                <Check className="w-3 h-3 mr-1" />
                Workflow Completed
              </Badge>
            )}
          </div>

          {/* Age counters */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4 text-sm">
            <AgeCell label="Booking" days={ageInDays(b.booking_date)} />
            <AgeCell label="Deposit" days={ageInDays(b.sd_received_date ?? b.cod_date)} />
            <AgeCell label="Config" days={ageInDays(b.configuration_date)} />
            <AgeCell label="Pickup" days={ageInDays(b.pickup_date)} />
            <AgeCell label="Delivery" days={ageInDays(b.delivery_date)} />
            <AgeCell label="Activation" days={ageInDays(b.activation_date)} />
          </div>
        </Card>

        {/* Stage 1 – Booking (immutable summary after save) */}
        <BookingSummary b={b} />

        {/* Stage 2 – KYC */}
        <KycCard b={b} locked={currentIdx < 1} done={currentIdx > 1} save={save} />

        {/* Stage 3 – Security Deposit */}
        <DepositCard b={b} locked={currentIdx < 2} done={currentIdx > 2} save={save} />

        {/* Stage 4 – Router Configuration */}
        <RouterConfigCard b={b} locked={currentIdx < 3} done={currentIdx > 3} save={save} />

        {/* Stage 5 – Dispatch */}
        <DispatchCard b={b} locked={currentIdx < 4} done={currentIdx > 4} save={save} />

        {/* Stage 6 – Activation */}
        <ActivationCard b={b} locked={currentIdx < 5} done={currentIdx > 5} save={save} />
      </div>
    </>
  );
}

// ============================================================
// Section shells
// ============================================================

function StageCard({
  step,
  title,
  locked,
  done,
  children,
}: {
  step: number;
  title: string;
  locked: boolean;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={`p-5 ${locked ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs">
            {step}
          </span>
          {title}
          {done && <Badge className="bg-emerald-600 hover:bg-emerald-600 ml-2">Saved</Badge>}
          {locked && (
            <Badge variant="outline" className="ml-2">
              <Lock className="w-3 h-3 mr-1" />
              Locked
            </Badge>
          )}
        </h2>
      </div>
      {locked ? (
        <p className="text-sm text-muted-foreground">
          Complete the previous stage to unlock this section.
        </p>
      ) : (
        children
      )}
    </Card>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "md:col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

function AgeCell({ label, days }: { label: string; days: number | null }) {
  const tone =
    days == null
      ? "text-muted-foreground"
      : days >= 30
      ? "text-destructive"
      : days >= 25
      ? "text-amber-600"
      : "text-foreground";
  return (
    <div className="rounded-lg border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${tone}`}>{ageLabel(days)}</div>
    </div>
  );
}

// ============================================================
// Stage 1 — Booking (summary; already saved on create)
// ============================================================
function BookingSummary({ b }: { b: Record<string, unknown> }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs">
            1
          </span>
          Booking
          <Badge className="bg-emerald-600 hover:bg-emerald-600 ml-2">Saved</Badge>
        </h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Row label="Booking Date" value={b.booking_date as string} />
        <Row label="Sales Employee" value={b.sales_employee as string} />
        <Row label="Mobile" value={b.mobile as string} />
        <Row label="Email" value={b.email as string} />
        <Row label="Address" value={b.address as string} />
        <Row label="Booking Code" value={<span className="font-mono">{b.booking_code as string}</span>} />
      </div>
    </Card>
  );
}

// ============================================================
// Stage 2 — KYC Verification
// ============================================================
type SaveFn = (
  fields: Record<string, unknown>,
  advanceTo: Stage | null,
  successMsg: string,
) => Promise<boolean>;

function KycCard({
  b,
  locked,
  done,
  save,
}: {
  b: Record<string, unknown>;
  locked: boolean;
  done: boolean;
  save: SaveFn;
}) {
  const [status, setStatus] = useState<string>((b.kyc_verification as string) ?? "");
  const [aadhaar, setAadhaar] = useState<string>((b.aadhaar_no as string) ?? "");
  const editMode = useEditMode();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus((b.kyc_verification as string) ?? "");
    setAadhaar((b.aadhaar_no as string) ?? "");
  }, [b]);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!status) m.push("KYC Status");
    if (status === "approved" && !aadhaar.trim()) m.push("Aadhaar Number");
    return m;
  }, [status, aadhaar]);

  const canSave = !locked && (!done || editMode) && status === "approved" && missing.length === 0;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    await save(
      {
        kyc_verification: status,
        aadhaar_no: aadhaar.trim(),
      },
      done ? null : "deposit",
      done ? "KYC updated" : "KYC saved — Security Deposit unlocked",
    );
    setSaving(false);
  }

  return (
    <StageCard step={2} title="KYC Verification" locked={locked} done={done}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Status *">
          <Select value={status} onValueChange={setStatus} disabled={done && !editMode}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="not_approved">Not Approved</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {status === "approved" && (
          <Field label="Aadhaar Number *">
            <Input
              value={aadhaar}
              onChange={(e) => setAadhaar(e.target.value)}
              placeholder="12-digit Aadhaar"
              disabled={done && !editMode}
            />
          </Field>
        )}
        {status === "not_approved" && (
          <div className="md:col-span-2 text-sm text-destructive">
            KYC is Not Approved — Security Deposit stage stays locked. Update status to Approved with Aadhaar to continue.
          </div>
        )}
      </div>
      {(!done || editMode) && (
        <div className="flex justify-end gap-2 mt-4">
          <Button disabled={!canSave || saving} onClick={onSave}>
            {saving ? "Saving…" : "Save KYC"}
          </Button>
        </div>
      )}
      {(!done || editMode) && missing.length > 0 && (
        <div className="text-xs text-destructive mt-2">Required: {missing.join(", ")}</div>
      )}
    </StageCard>
  );
}

// ============================================================
// Stage 3 — Security Deposit (auto-creates Customer on save)
// ============================================================
function DepositCard({
  b,
  locked,
  done,
  save,
}: {
  b: Record<string, unknown>;
  locked: boolean;
  done: boolean;
  save: SaveFn;
}) {
  const [status, setStatus] = useState<string>((b.sd_status as string) ?? "");
  const [amount, setAmount] = useState<string>(b.sd_amount != null ? String(b.sd_amount) : "");
  const [txn, setTxn] = useState<string>((b.sd_txn_id as string) ?? "");
  const [receivedOn, setReceivedOn] = useState<string>((b.sd_received_on as string) ?? "");
  const [sdDate, setSdDate] = useState<string>((b.sd_received_date as string) ?? "");
  // COD fields
  const [codAmount, setCodAmount] = useState<string>(b.cod_amount != null ? String(b.cod_amount) : "300");
  const [codDate, setCodDate] = useState<string>((b.cod_date as string) ?? "");
  const [codTxn, setCodTxn] = useState<string>((b.cod_txn_id as string) ?? "");
  const [codReceivedOn, setCodReceivedOn] = useState<string>((b.cod_received_on as string) ?? "");
  const editMode = useEditMode();
  const [saving, setSaving] = useState(false);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!status) m.push("Status");
    if (status === "received") {
      if (!amount) m.push("Deposit Amount");
      if (!txn.trim()) m.push("SD Transaction ID");
      if (!receivedOn) m.push("Received On");
    } else if (status === "cod") {
      if (!codAmount) m.push("COD Amount");
      if (!codDate) m.push("COD Date");
      if (!codTxn.trim()) m.push("Transaction ID");
      if (!codReceivedOn) m.push("Received On");
    }
    return m;
  }, [status, amount, txn, receivedOn, codAmount, codDate, codTxn, codReceivedOn]);

  const canSave =
    !locked && (!done || editMode) && (status === "received" || status === "cod") && missing.length === 0;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    const fields: Record<string, unknown> = { sd_status: status };
    if (status === "received") {
      fields.sd_amount = Number(amount);
      fields.sd_txn_id = txn.trim();
      fields.sd_received_on = receivedOn;
      fields.sd_received_date = sdDate || new Date().toISOString().slice(0, 10);
    } else {
      fields.cod_amount = Number(codAmount);
      fields.cod_date = codDate;
      fields.cod_txn_id = codTxn.trim();
      fields.cod_received_on = codReceivedOn;
    }
    const ok = await save(fields, done ? null : "router_config", done ? "Deposit updated" : "Deposit saved — Customer created, Router Config unlocked");
    setSaving(false);
    if (ok) toast.info("Customer record generated automatically");
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <StageCard step={3} title="Security Deposit" locked={locked} done={done}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Security Deposit Status *">
          <Select value={status} onValueChange={setStatus} disabled={done && !editMode}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="cod">COD</SelectItem>
              <SelectItem value="not_received">Not Received</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {status === "received" && (
          <>
            <Field label="Deposit Amount *">
              <Select value={amount} onValueChange={setAmount} disabled={done && !editMode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select amount" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1770">₹1770</SelectItem>
                  <SelectItem value="2063.82">₹2063.82</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {amount && (
              <>
                <Field label="SD Transaction ID *">
                  <Input value={txn} onChange={(e) => setTxn(e.target.value)} disabled={done && !editMode} />
                </Field>
                <Field label="Received On *">
                  <Select value={receivedOn} onValueChange={setReceivedOn} disabled={done && !editMode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="razorpay">Razorpay</SelectItem>
                      <SelectItem value="zoho_pay">Zoho Pay</SelectItem>
                      <SelectItem value="company_account">Company Account</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Received Date">
                  <Input
                    type="date"
                    value={sdDate}
                    onChange={(e) => setSdDate(e.target.value)}
                    max={today}
                    disabled={done && !editMode}
                  />
                </Field>
              </>
            )}
          </>
        )}

        {status === "cod" && (
          <>
            <Field label="COD Amount *">
              <Input
                type="number"
                value={codAmount}
                onChange={(e) => setCodAmount(e.target.value)}
                disabled={done && !editMode}
              />
            </Field>
            <Field label="COD Date *">
              <Input
                type="date"
                value={codDate}
                onChange={(e) => setCodDate(e.target.value)}
                max={today}
                disabled={done && !editMode}
              />
            </Field>
            <Field label="Transaction ID *">
              <Input value={codTxn} onChange={(e) => setCodTxn(e.target.value)} disabled={done && !editMode} />
            </Field>
            <Field label="Received On *">
              <Select value={codReceivedOn} onValueChange={setCodReceivedOn} disabled={done && !editMode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shiprocket">Shiprocket</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        {status === "not_received" && (
          <div className="md:col-span-2 text-sm text-destructive">
            Deposit not received — Router Configuration stays locked.
          </div>
        )}
      </div>

      {(!done || editMode) && (
        <div className="flex justify-end gap-2 mt-4">
          <Button disabled={!canSave || saving} onClick={onSave}>
            {saving ? "Saving…" : "Save Security Deposit"}
          </Button>
        </div>
      )}
      {(!done || editMode) && missing.length > 0 && (
        <div className="text-xs text-destructive mt-2">Required: {missing.join(", ")}</div>
      )}
    </StageCard>
  );
}

// ============================================================
// Stage 4 — Router Configuration
// ============================================================
function RouterConfigCard({
  b,
  locked,
  done,
  save,
}: {
  b: Record<string, unknown>;
  locked: boolean;
  done: boolean;
  save: SaveFn;
}) {
  const [f, setF] = useState({
    router_ssid: (b.router_ssid as string) ?? "",
    router_password: (b.router_password as string) ?? "",
    router_company: (b.router_company as string) ?? "Wavelink",
    router_model_no: (b.router_model_no as string) ?? "",
    sim_company: (b.sim_company as string) ?? "",
    sim_packet_no: (b.sim_packet_no as string) ?? "",
    router_sim_no: (b.router_sim_no as string) ?? "",
    router_imei_mac: (b.router_imei_mac as string) ?? "",
  });
  const editMode = useEditMode();
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!f.router_ssid.trim()) m.push("Router SSID");
    if (!f.router_password.trim()) m.push("Router Password");
    if (!f.router_company.trim()) m.push("Router Company");
    if (!f.router_model_no.trim()) m.push("Router Model Number");
    if (!f.sim_company) m.push("SIM Company");
    if (!f.sim_packet_no.trim()) m.push("SIM Packet Number");
    if (!f.router_sim_no.trim()) m.push("SIM Number");
    if (!f.router_imei_mac.trim()) m.push("Router IMEI Number");
    return m;
  }, [f]);

  const canSave = !locked && (!done || editMode) && missing.length === 0;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    await save(
      {
        router_ssid: f.router_ssid.trim(),
        router_password: f.router_password.trim(),
        router_company: f.router_company.trim(),
        router_model_no: f.router_model_no.trim(),
        sim_company: f.sim_company,
        sim_packet_no: f.sim_packet_no.trim(),
        router_sim_no: f.router_sim_no.trim(),
        router_imei_mac: f.router_imei_mac.trim(),
        configuration_date: new Date().toISOString().slice(0, 10),
      },
      done ? null : "dispatch",
      done ? "Router config updated" : "Router Configuration saved — Dispatch unlocked",
    );
    setSaving(false);
  }

  return (
    <StageCard step={4} title="Router Configuration" locked={locked} done={done}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Router SSID *"><Input value={f.router_ssid} onChange={set("router_ssid")} disabled={done && !editMode} /></Field>
        <Field label="Router Password *"><Input value={f.router_password} onChange={set("router_password")} disabled={done && !editMode} /></Field>
        <Field label="Router Company *"><Input value={f.router_company} onChange={set("router_company")} disabled={done && !editMode} /></Field>
        <Field label="Router Model Number *"><Input value={f.router_model_no} onChange={set("router_model_no")} disabled={done && !editMode} /></Field>
        <Field label="SIM Company *">
          <Select value={f.sim_company} onValueChange={(v) => setF({ ...f, sim_company: v })} disabled={done && !editMode}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="airtel">Airtel</SelectItem>
              <SelectItem value="vi">Vi</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="SIM Packet Number *"><Input value={f.sim_packet_no} onChange={set("sim_packet_no")} disabled={done && !editMode} /></Field>
        <Field label="SIM Number *"><Input value={f.router_sim_no} onChange={set("router_sim_no")} disabled={done && !editMode} /></Field>
        <Field label="Router IMEI Number *"><Input value={f.router_imei_mac} onChange={set("router_imei_mac")} disabled={done && !editMode} /></Field>
      </div>
      {(!done || editMode) && (
        <div className="flex justify-end gap-2 mt-4">
          <Button disabled={!canSave || saving} onClick={onSave}>
            {saving ? "Saving…" : "Save Configuration"}
          </Button>
        </div>
      )}
      {(!done || editMode) && missing.length > 0 && (
        <div className="text-xs text-destructive mt-2">Required: {missing.join(", ")}</div>
      )}
    </StageCard>
  );
}

// ============================================================
// Stage 5 — Dispatch
// ============================================================
function DispatchCard({
  b,
  locked,
  done,
  save,
}: {
  b: Record<string, unknown>;
  locked: boolean;
  done: boolean;
  save: SaveFn;
}) {
  const [status, setStatus] = useState<string>((b.dispatch_status as string) ?? "");
  const [configDate, setConfigDate] = useState<string>((b.configuration_date as string) ?? "");
  const [scheduleDate, setScheduleDate] = useState<string>((b.dispatch_schedule_date as string) ?? "");
  const [pickupDate, setPickupDate] = useState<string>((b.pickup_date as string) ?? "");
  const [deliveryDate, setDeliveryDate] = useState<string>((b.delivery_date as string) ?? "");
  const editMode = useEditMode();
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!status) m.push("Dispatch Status");
    if (status === "router_configured" && !configDate) m.push("Configuration Date");
    if (status === "dispatch_scheduled" && !scheduleDate) m.push("Dispatch Schedule Date");
    if (status === "picked_up" && !pickupDate) m.push("Pickup Date");
    if (status === "delivered" && !deliveryDate) m.push("Delivery Date");
    return m;
  }, [status, configDate, scheduleDate, pickupDate, deliveryDate]);

  // Only "delivered" advances the stage. Other statuses save progress in-place.
  const canSave = !locked && (!done || editMode) && missing.length === 0;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    const fields: Record<string, unknown> = { dispatch_status: status };
    if (status === "router_configured") fields.configuration_date = configDate;
    if (status === "dispatch_scheduled") fields.dispatch_schedule_date = scheduleDate;
    if (status === "picked_up") fields.pickup_date = pickupDate;
    if (status === "delivered") {
      fields.delivery_date = deliveryDate;
      fields.dispatched_at = deliveryDate;
    }
    const advance: Stage | null = done ? null : (status === "delivered" ? "activation" : null);
    await save(
      fields,
      advance,
      advance ? "Dispatch delivered — Activation unlocked" : "Dispatch progress saved",
    );
    setSaving(false);
  }

  return (
    <StageCard step={5} title="Dispatch" locked={locked} done={done}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Dispatch Status *">
          <Select value={status} onValueChange={setStatus} disabled={done && !editMode}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="router_configured">Router Configured</SelectItem>
              <SelectItem value="dispatch_scheduled">Dispatch Scheduled</SelectItem>
              <SelectItem value="picked_up">Picked Up</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {status === "router_configured" && (
          <Field label="Configuration Date *">
            <Input type="date" value={configDate} onChange={(e) => setConfigDate(e.target.value)} max={today} disabled={done && !editMode} />
          </Field>
        )}
        {status === "dispatch_scheduled" && (
          <Field label="Dispatch Schedule Date *">
            <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} disabled={done && !editMode} />
          </Field>
        )}
        {status === "picked_up" && (
          <Field label="Pickup Date *">
            <Input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} max={today} disabled={done && !editMode} />
          </Field>
        )}
        {status === "delivered" && (
          <Field label="Delivery Date *">
            <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} max={today} disabled={done && !editMode} />
          </Field>
        )}
      </div>
      {(!done || editMode) && (
        <div className="flex justify-end gap-2 mt-4">
          <Button disabled={!canSave || saving} onClick={onSave}>
            {saving ? "Saving…" : status === "delivered" ? "Save Dispatch & Deliver" : "Save Dispatch"}
          </Button>
        </div>
      )}
      {(!done || editMode) && missing.length > 0 && (
        <div className="text-xs text-destructive mt-2">Required: {missing.join(", ")}</div>
      )}
    </StageCard>
  );
}

// ============================================================
// Stage 6 — Activation
// ============================================================
function ActivationCard({
  b,
  locked,
  done,
  save,
}: {
  b: Record<string, unknown>;
  locked: boolean;
  done: boolean;
  save: SaveFn;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>((b.activation_date as string) ?? today);
  const [status, setStatus] = useState<string>((b.activation_status as string) ?? "");
  const [notes, setNotes] = useState<string>((b.activation_notes as string) ?? "");
  const editMode = useEditMode();
  const [saving, setSaving] = useState(false);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!date) m.push("Activation Date");
    if (!status) m.push("Activation Status");
    if (!notes.trim()) m.push("Notes");
    return m;
  }, [date, status, notes]);

  const canSave = !locked && (!done || editMode) && missing.length === 0;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    await save(
      {
        activation_date: date,
        activation_status: status,
        activation_notes: notes.trim(),
      },
      done ? null : "completed",
      done ? "Activation updated" : "Booking workflow completed ✓",
    );
    setSaving(false);
  }

  return (
    <StageCard step={6} title="Activation" locked={locked} done={done}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Activation Date *">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today} disabled={done && !editMode} />
        </Field>
        <Field label="Activation Status *">
          <Select value={status} onValueChange={setStatus} disabled={done && !editMode}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Notes *" full>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={done && !editMode} />
        </Field>
      </div>
      {(!done || editMode) && (
        <div className="flex justify-end gap-2 mt-4">
          <Button disabled={!canSave || saving} onClick={onSave}>
            {saving ? "Saving…" : "Save Activation"}
          </Button>
        </div>
      )}
      {(!done || editMode) && missing.length > 0 && (
        <div className="text-xs text-destructive mt-2">Required: {missing.join(", ")}</div>
      )}
    </StageCard>
  );
}
