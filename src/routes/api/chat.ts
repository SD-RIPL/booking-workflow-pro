import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require an authenticated staff session — this endpoint invokes admin-scoped tools.
        const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
        const token = authHeader?.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : null;
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabasePublishable = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !supabasePublishable) {
          return new Response("Server not configured", { status: 500 });
        }
        const { createClient } = await import("@supabase/supabase-js");
        const isNewKey = supabasePublishable.startsWith("sb_publishable_") || supabasePublishable.startsWith("sb_secret_");
        const authClient = createClient(supabaseUrl, supabasePublishable, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (isNewKey && h.get("Authorization") === `Bearer ${supabasePublishable}`) h.delete("Authorization");
              h.set("apikey", supabasePublishable);
              return fetch(input, { ...init, headers: h });
            },
          },
        });
        const { data: userData, error: userErr } = await authClient.auth.getUser(token);
        if (userErr || !userData?.user) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Only staff (any row in user_roles) can use the assistant.
        const { data: isStaff } = await supabaseAdmin.rpc("is_staff", { _user_id: userData.user.id });
        if (!isStaff) return new Response("Forbidden", { status: 403 });

        const { messages } = (await request.json()) as { messages: UIMessage[] };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const lookupCustomer = tool({
          description:
            "Look up a customer with recharges + tickets by mobile, customer code, or ticket code (e.g. T-00001).",
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            const q = query.trim();
            const { data: tkt } = await supabaseAdmin.from("tickets").select("*").ilike("ticket_code", q).maybeSingle();
            let customerId: string | null = tkt?.customer_id ?? null;
            let matchedTicket: any = null;
            if (tkt) {
              const { data: updates } = await supabaseAdmin.from("ticket_updates").select("status, remark, created_at").eq("ticket_id", tkt.id).order("created_at", { ascending: true });
              matchedTicket = { ...tkt, updates: updates ?? [] };
            }
            let customer: any = null;
            if (customerId) {
              const { data } = await supabaseAdmin.from("customers").select("*").eq("id", customerId).maybeSingle();
              customer = data;
            } else {
              const { data } = await supabaseAdmin.from("customers").select("*").or(`mobile.eq.${q},alternate_mobile.eq.${q},customer_code.ilike.${q}`).maybeSingle();
              customer = data;
              customerId = data?.id ?? null;
            }
            if (!customer && !matchedTicket) return { found: false, query: q };
            const [recharges, tickets] = await Promise.all([
              customerId ? supabaseAdmin.from("recharges").select("recharge_code, recharge_date, plan_amount, validity_days, expiry_date, payment_mode").eq("customer_id", customerId).order("recharge_date", { ascending: false }).limit(10) : Promise.resolve({ data: [] as any[] }),
              customerId ? supabaseAdmin.from("tickets").select("ticket_code, subject, status, priority, created_at, resolution_remark").eq("customer_id", customerId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
            ]);
            return { found: true, customer, matched_ticket: matchedTicket, recharges: recharges.data ?? [], tickets: tickets.data ?? [] };
          },
        });

        const lookupSim = tool({
          description: "Look up a SIM card by SIM number or packet number.",
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            const q = query.trim();
            const { data } = await supabaseAdmin.from("sims").select("*").or(`sim_number.ilike.%${q}%,packet_number.ilike.%${q}%`).limit(10);
            return { count: data?.length ?? 0, sims: data ?? [] };
          },
        });

        const lookupRouter = tool({
          description: "Look up a router by serial number, model, or company.",
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            const q = query.trim();
            const { data } = await supabaseAdmin.from("routers").select("*").or(`serial_number.ilike.%${q}%,model.ilike.%${q}%,company.ilike.%${q}%`).limit(10);
            return { count: data?.length ?? 0, routers: data ?? [] };
          },
        });

        const lookupBooking = tool({
          description: "Look up a booking by name, mobile or sales employee to see current workflow stage.",
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            const q = query.trim();
            const { data } = await supabaseAdmin.from("bookings").select("id, full_name, mobile, email, workflow_stage, booking_date, sales_employee, created_at").or(`full_name.ilike.%${q}%,mobile.ilike.%${q}%,email.ilike.%${q}%,sales_employee.ilike.%${q}%`).order("created_at", { ascending: false }).limit(10);
            return { count: data?.length ?? 0, bookings: data ?? [] };
          },
        });

        const lookupAudit = tool({
          description: "Search recent audit logs by module (bookings, customers, recharges, tickets, users…) or action.",
          inputSchema: z.object({ module: z.string().optional(), action: z.string().optional(), limit: z.number().optional() }),
          execute: async ({ module, action, limit }) => {
            let q = supabaseAdmin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit ?? 30);
            if (module) q = q.ilike("module", `%${module}%`);
            if (action) q = q.ilike("action", `%${action}%`);
            const { data } = await q;
            return { count: data?.length ?? 0, logs: data ?? [] };
          },
        });

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system:
            "You are the Rishishwar Net Connection support assistant. " +
            "Staff paste a ticket code (T-00001), mobile, customer code, SIM number, router serial, or ask about bookings/audit logs. " +
            "Pick the right tool: lookup_customer for customer/ticket/recharge queries, lookup_sim for SIM lookups, lookup_router for router lookups, lookup_booking for booking pipeline queries, lookup_audit for audit trail. " +
            "Then summarise in clear bullets. Use ₹ for amounts. Reply in the user's language (Hindi/Hinglish/English).",
          messages: await convertToModelMessages(messages),
          tools: {
            lookup_customer: lookupCustomer,
            lookup_sim: lookupSim,
            lookup_router: lookupRouter,
            lookup_booking: lookupBooking,
            lookup_audit: lookupAudit,
          },
          stopWhen: stepCountIs(50),
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});
