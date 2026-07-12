import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, RefreshCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  ssr: false,
  component: NotificationsPage,
});

function NotificationsPage() {
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications" as any)
        .select("*, customers(full_name, customer_code)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function seedFromFlags() {
    // Queue reminders for customers with due_soon or ready_for_suspension
    const { data: custs, error } = await supabase.from("customers")
      .select("id,full_name,mobile,due_soon_flag,ready_for_suspension,days_since_last_recharge")
      .or("due_soon_flag.eq.true,ready_for_suspension.eq.true")
      .is("deleted_at", null);
    if (error) return toast.error(error.message);
    if (!custs || custs.length === 0) return toast.info("No due-soon or suspension-ready customers.");

    const rows = custs.map((c: any) => {
      const isSuspend = c.ready_for_suspension;
      const template = isSuspend ? "suspension_ready" : "due_soon";
      const msg = isSuspend
        ? `Dear ${c.full_name}, your internet service is due for suspension (${c.days_since_last_recharge}+ days without recharge). Please recharge immediately. — Rishishwar`
        : `Dear ${c.full_name}, your recharge is due soon (${c.days_since_last_recharge} days). Please recharge to avoid interruption. — Rishishwar`;
      return {
        customer_id: c.id, channel: "sms", template,
        phone: c.mobile, message: msg, status: "pending",
      };
    });
    const { error: e2 } = await supabase.from("notifications" as any).insert(rows);
    if (e2) return toast.error(e2.message);
    toast.success(`Queued ${rows.length} notifications`);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function sendPending() {
    setSending(true);
    try {
      const res = await fetch("/api/public/send-notifications", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      toast.success(`Processed ${json.processed} — sent ${json.sent}, failed ${json.failed}`);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setSending(false); }
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description={`${data?.length ?? 0} messages`}
        actions={<>
          <Button variant="outline" onClick={seedFromFlags}><RefreshCcw className="w-4 h-4 mr-1" /> Queue reminders</Button>
          <Button onClick={sendPending} disabled={sending}><Send className="w-4 h-4 mr-1" /> {sending ? "Sending…" : "Send pending"}</Button>
        </>}
      />
      <div className="p-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-left px-4 py-3">Customer</th>
                  <th className="text-left px-4 py-3">Channel</th>
                  <th className="text-left px-4 py-3">Template</th>
                  <th className="text-left px-4 py-3">Phone</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.map((n: any) => (
                  <tr key={n.id} className="hover:bg-accent/30">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(n.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">{n.customers?.full_name ?? "—"}</td>
                    <td className="px-4 py-3 capitalize">{n.channel}</td>
                    <td className="px-4 py-3">{n.template}</td>
                    <td className="px-4 py-3 font-mono text-xs">{n.phone}</td>
                    <td className="px-4 py-3">
                      <Badge variant={n.status === "sent" ? "default" : n.status === "failed" ? "destructive" : "secondary"}>
                        {n.status}
                      </Badge>
                      {n.error && <div className="text-xs text-destructive mt-1">{n.error}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-md truncate">{n.message}</td>
                  </tr>
                ))}
                {(data?.length ?? 0) === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No notifications yet. Use “Queue reminders” to enqueue for due-soon / suspension-ready customers.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-xs text-muted-foreground mt-3">
          To actually send SMS/WhatsApp, connect Twilio: add secrets <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>,
          <code>TWILIO_FROM</code> (SMS sender) and optional <code>TWILIO_WHATSAPP_FROM</code>. Otherwise messages remain queued.
        </p>
      </div>
    </>
  );
}
