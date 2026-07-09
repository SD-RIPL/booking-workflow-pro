import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as { messages: UIMessage[] };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const lookupCustomer = tool({
          description:
            "Look up a customer and their recharges + tickets by mobile number, customer code, or ticket code (e.g. T-00001). Use whenever the user provides a number/code.",
          inputSchema: z.object({
            query: z.string().describe("Mobile number, customer code, or ticket code"),
          }),
          execute: async ({ query }) => {
            const q = query.trim();

            // Try ticket code first
            const { data: tkt } = await supabaseAdmin
              .from("tickets")
              .select("*")
              .ilike("ticket_code", q)
              .maybeSingle();

            let customerId: string | null = tkt?.customer_id ?? null;
            let matchedTicket: any = null;

            if (tkt) {
              const { data: updates } = await supabaseAdmin
                .from("ticket_updates")
                .select("status, remark, created_at")
                .eq("ticket_id", tkt.id)
                .order("created_at", { ascending: true });
              matchedTicket = { ...tkt, updates: updates ?? [] };
            }

            let customer: any = null;
            if (customerId) {
              const { data } = await supabaseAdmin.from("customers").select("*").eq("id", customerId).maybeSingle();
              customer = data;
            } else {
              const { data } = await supabaseAdmin
                .from("customers")
                .select("*")
                .or(`mobile.eq.${q},alternate_mobile.eq.${q},customer_code.ilike.${q}`)
                .maybeSingle();
              customer = data;
              customerId = data?.id ?? null;
            }

            if (!customer && !matchedTicket) return { found: false, query: q };

            const [recharges, tickets] = await Promise.all([
              customerId
                ? supabaseAdmin
                    .from("recharges")
                    .select("recharge_code, recharge_date, plan_amount, validity_days, expiry_date, payment_mode")
                    .eq("customer_id", customerId)
                    .order("recharge_date", { ascending: false })
                    .limit(10)
                : Promise.resolve({ data: [] as any[] }),
              customerId
                ? supabaseAdmin
                    .from("tickets")
                    .select("ticket_code, subject, status, priority, created_at, resolution_remark")
                    .eq("customer_id", customerId)
                    .order("created_at", { ascending: false })
                : Promise.resolve({ data: [] as any[] }),
            ]);

            return {
              found: true,
              customer,
              matched_ticket: matchedTicket,
              recharges: recharges.data ?? [],
              tickets: tickets.data ?? [],
            };
          },
        });

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system:
            "You are the Rishishwar Net Connection support assistant. " +
            "Staff will paste a ticket code (e.g. T-00001), mobile number, or customer code. " +
            "Always call the lookup_customer tool first, then summarise the customer's status, latest recharge, expiry, open tickets and resolution progress in clear, friendly bullets. " +
            "Use ₹ for amounts. If not found, say so plainly. Reply in the language the user used (Hindi/Hinglish/English).",
          messages: await convertToModelMessages(messages),
          tools: { lookup_customer: lookupCustomer },
          stopWhen: stepCountIs(50),
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});
