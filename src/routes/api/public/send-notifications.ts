import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/send-notifications")({
  server: {
    handlers: {
      POST: async () => {
        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey) {
          return Response.json({ error: "Server not configured" }, { status: 500 });
        }
        const { createClient } = await import("@supabase/supabase-js");
        const admin = createClient(url, serviceKey);

        const { data: pending, error } = await admin
          .from("notifications")
          .select("*")
          .eq("status", "pending")
          .limit(100);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        const smsFrom = process.env.TWILIO_FROM;
        const waFrom = process.env.TWILIO_WHATSAPP_FROM;

        let sent = 0, failed = 0;
        for (const n of pending ?? []) {
          try {
            if (!sid || !token || !smsFrom) throw new Error("Twilio not configured — add TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM secrets");
            const from = n.channel === "whatsapp" ? (waFrom ? `whatsapp:${waFrom}` : null) : smsFrom;
            if (!from) throw new Error("No FROM for channel " + n.channel);
            const to = n.channel === "whatsapp" ? `whatsapp:${n.phone}` : n.phone;

            const body = new URLSearchParams({ From: from, To: to, Body: n.message });
            const res = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
              {
                method: "POST",
                headers: {
                  Authorization: "Basic " + btoa(`${sid}:${token}`),
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body,
              },
            );
            const json: any = await res.json();
            if (!res.ok) throw new Error(json?.message ?? `Twilio ${res.status}`);
            await admin.from("notifications").update({
              status: "sent", provider_sid: json.sid, sent_at: new Date().toISOString(), error: null,
            }).eq("id", n.id);
            sent++;
          } catch (e: any) {
            failed++;
            await admin.from("notifications").update({
              status: "failed", error: String(e.message ?? e),
            }).eq("id", n.id);
          }
        }
        return Response.json({ processed: pending?.length ?? 0, sent, failed });
      },
    },
  },
});
