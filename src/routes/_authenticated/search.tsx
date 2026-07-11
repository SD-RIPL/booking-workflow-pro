import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/search")({
  ssr: false,
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["universal-search", q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const term = `%${q}%`;
      const [c, r, s, rt, p, tk, bk, au] = await Promise.all([
        supabase.from("customers").select("id, customer_code, full_name, mobile, email, city")
          .or(`full_name.ilike.${term},mobile.ilike.${term},alternate_mobile.ilike.${term},customer_code.ilike.${term},email.ilike.${term},city.ilike.${term}`),
        supabase.from("recharges").select("id, recharge_code, customer_id, plan_amount, recharge_date, payment_mode")
          .or(`recharge_code.ilike.${term},payment_mode.ilike.${term}`),
        supabase.from("sims").select("id, sim_number, packet_number, company, status")
          .or(`sim_number.ilike.${term},packet_number.ilike.${term},company.ilike.${term}`),
        supabase.from("routers").select("id, serial_number, model, status, company")
          .or(`serial_number.ilike.${term},model.ilike.${term},company.ilike.${term}`),
        supabase.from("payments").select("id, payment_code, customer_id, total_amount, reference_number, payment_mode")
          .or(`payment_code.ilike.${term},reference_number.ilike.${term},payment_mode.ilike.${term}`),
        supabase.from("tickets").select("id, ticket_code, customer_id, subject, status, priority, created_at")
          .or(`ticket_code.ilike.${term},subject.ilike.${term},status.ilike.${term}`),
        supabase.from("bookings").select("id, full_name, mobile, workflow_stage, booking_date, sales_employee")
          .or(`full_name.ilike.${term},mobile.ilike.${term},email.ilike.${term},sales_employee.ilike.${term}`),
        supabase.from("audit_logs").select("id, module, action, entity_id, created_at, user_id")
          .or(`module.ilike.${term},action.ilike.${term}`).order("created_at", { ascending: false }).limit(200),
      ]);
      return {
        customers: c.data ?? [], recharges: r.data ?? [], sims: s.data ?? [],
        routers: rt.data ?? [], payments: p.data ?? [], tickets: tk.data ?? [],
        bookings: bk.data ?? [], audit: au.data ?? [],
      };
    },
  });

  const totalResults = data
    ? Object.values(data).reduce((a: number, v: any) => a + v.length, 0)
    : 0;

  return (
    <>
      <PageHeader title="Universal Search" description="Search every module — no limits" />
      <div className="p-6 space-y-4">
        <Card className="p-3">
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 h-11 text-base" autoFocus placeholder="Type name, mobile, code, SIM, router, ticket, payment ref…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {data && <p className="text-xs text-muted-foreground mt-2">{totalResults} results across all modules</p>}
        </Card>

        {q.length < 2 && <p className="text-sm text-muted-foreground text-center py-8">Type at least 2 characters.</p>}
        {isLoading && <p className="text-sm text-muted-foreground text-center py-4">Searching…</p>}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ResultSection title={`Customers (${data.customers.length})`}>
              {data.customers.map((c: any) => (
                <Link key={c.id} to="/customers/$id" params={{ id: c.id }} className="block p-2 rounded hover:bg-accent">
                  <div className="font-medium">{c.full_name}</div>
                  <div className="text-xs text-muted-foreground">{c.customer_code} · {c.mobile} · {c.city ?? "—"}</div>
                </Link>
              ))}
            </ResultSection>
            <ResultSection title={`Bookings (${data.bookings.length})`}>
              {data.bookings.map((b: any) => (
                <Link key={b.id} to="/bookings/$id" params={{ id: b.id }} className="block p-2 rounded hover:bg-accent text-sm">
                  <div className="font-medium">{b.full_name} · <span className="text-xs uppercase text-muted-foreground">{b.workflow_stage}</span></div>
                  <div className="text-xs text-muted-foreground">{b.mobile} · {b.sales_employee ?? "—"} · {b.booking_date}</div>
                </Link>
              ))}
            </ResultSection>
            <ResultSection title={`Recharges (${data.recharges.length})`}>
              {data.recharges.map((r: any) => (
                <Link key={r.id} to="/customers/$id" params={{ id: r.customer_id }} className="block p-2 rounded hover:bg-accent text-sm">
                  {r.recharge_code} · ₹{r.plan_amount} · {r.recharge_date} · {r.payment_mode}
                </Link>
              ))}
            </ResultSection>
            <ResultSection title={`Payments (${data.payments.length})`}>
              {data.payments.map((p: any) => (
                <Link key={p.id} to="/customers/$id" params={{ id: p.customer_id }} className="block p-2 rounded hover:bg-accent text-sm">
                  {p.payment_code} · ₹{p.total_amount} · {p.payment_mode} · {p.reference_number ?? "—"}
                </Link>
              ))}
            </ResultSection>
            <ResultSection title={`Tickets (${data.tickets.length})`}>
              {data.tickets.map((t: any) => (
                <div key={t.id} className="p-2 text-sm">
                  <div className="font-medium">{t.ticket_code} · <span className="text-xs uppercase">{t.status}</span></div>
                  <div className="text-xs text-muted-foreground">{t.subject} · {t.priority}</div>
                </div>
              ))}
            </ResultSection>
            <ResultSection title={`SIMs (${data.sims.length})`}>
              {data.sims.map((s: any) => (
                <div key={s.id} className="p-2 text-sm">{s.sim_number} · <span className="uppercase">{s.company}</span> · {s.status}</div>
              ))}
            </ResultSection>
            <ResultSection title={`Routers (${data.routers.length})`}>
              {data.routers.map((r: any) => (
                <div key={r.id} className="p-2 text-sm">{r.serial_number} · {r.model ?? "—"} · {r.company ?? "—"} · {r.status}</div>
              ))}
            </ResultSection>
            <ResultSection title={`Audit Log (${data.audit.length})`}>
              {data.audit.map((a: any) => (
                <div key={a.id} className="p-2 text-xs">
                  <span className="font-mono">{new Date(a.created_at).toLocaleString()}</span> · <span className="capitalize font-medium">{a.module}</span> · {a.action}
                </div>
              ))}
            </ResultSection>
          </div>
        )}
      </div>
    </>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="font-semibold text-sm mb-2">{title}</h3>
      <div className="divide-y max-h-96 overflow-y-auto">{children}</div>
    </Card>
  );
}
