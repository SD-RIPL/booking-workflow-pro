import { supabase } from "@/integrations/supabase/client";

export async function logAudit(opts: {
  action: string;
  module: string;
  entity_id?: string | null;
  old_value?: unknown;
  new_value?: unknown;
}) {
  // Server-side SECURITY DEFINER function enforces auth + role checks
  // and stamps user_id from auth.uid().
  await supabase.rpc("log_audit_event", {
    _module: opts.module,
    _action: opts.action,
    _entity_id: (opts.entity_id ?? null) as never,
    _old_value: (opts.old_value ?? null) as never,
    _new_value: (opts.new_value ?? null) as never,
  });
}


export function formatINR(n: number | null | undefined) {
  if (n == null) return "₹0";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export const RECHARGE_PLANS = [299, 399, 499, 599, 699, 799, 999, 1499, 1999];
