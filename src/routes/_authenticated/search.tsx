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

  const { data } = useQuery({
    queryKey: ["universal-search", q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const term = `%${q}%`;
      const [c, r, s, rt, p] = await Promise.all([
        supabase.from("customers").select("id, customer_code, full_name, mobile").or(`full_name.ilike.${term},mobile.ilike.${term},customer_code.ilike.${term}`).limit(20),
        supabase.from("recharges").select("id, recharge_code, customer_id, plan_amount, recharge_date").ilike("recharge_code", term).limit(20),
        supabase.from("sims").select("id, sim_number, packet_number, company, status").or(`sim_number.ilike.${term},packet_number.ilike.${term}`).limit(20),
        supabase.from("routers").select("id, serial_number, model, status").ilike("serial_number", term).limit(20),
        supabase.from("payments").select("id, payment_code, customer_id, total_amount").or(`payment_code.ilike.${term},reference_number.ilike.${term}`).limit(20),
      ]);
      return { customers: c.data ?? [], recharges: r.data ?? [], sims: s.data ?? [], routers: rt.data ?? [], payments: p.data ?? [] };
    },
  });

  return (
    <>
      <PageHeader title="Universal Search" description="Find customers, recharges, SIMs, routers, and payments" />
      <div className="p-6 space-y-4">
        <Card className="p-3">
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 h-11 text-base" autoFocus placeholder="Type name, mobile, customer ID, SIM, router serial, transaction…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </Card>

        {q.length < 2 && <p className="text-sm text-muted-foreground text-center py-8">Type at least 2 characters.</p>}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ResultSection title={`Customers (${data.customers.length})`}>
              {data.customers.map((c: any) => (
                <Link key={c.id} to="/customers/$id" params={{ id: c.id }} className="block p-2 rounded hover:bg-accent">
                  <div className="font-medium">{c.full_name}</div>
                  <div className="text-xs text-muted-foreground">{c.customer_code} · {c.mobile}</div>
                </Link>
              ))}
            </ResultSection>
            <ResultSection title={`Recharges (${data.recharges.length})`}>
              {data.recharges.map((r: any) => (
                <Link key={r.id} to="/customers/$id" params={{ id: r.customer_id }} className="block p-2 rounded hover:bg-accent text-sm">
                  {r.recharge_code} · ₹{r.plan_amount} · {r.recharge_date}
                </Link>
              ))}
            </ResultSection>
            <ResultSection title={`SIMs (${data.sims.length})`}>
              {data.sims.map((s: any) => (
                <div key={s.id} className="p-2 text-sm">{s.sim_number} · <span className="uppercase">{s.company}</span> · {s.status}</div>
              ))}
            </ResultSection>
            <ResultSection title={`Routers (${data.routers.length})`}>
              {data.routers.map((r: any) => (
                <div key={r.id} className="p-2 text-sm">{r.serial_number} · {r.model ?? "—"} · {r.status}</div>
              ))}
            </ResultSection>
            <ResultSection title={`Payments (${data.payments.length})`}>
              {data.payments.map((p: any) => (
                <Link key={p.id} to="/customers/$id" params={{ id: p.customer_id }} className="block p-2 rounded hover:bg-accent text-sm">
                  {p.payment_code} · ₹{p.total_amount}
                </Link>
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
      <div className="divide-y">{children}</div>
    </Card>
  );
}
