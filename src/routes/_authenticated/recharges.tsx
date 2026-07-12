import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { formatINR } from "@/lib/crm";
import { AgeCounter } from "@/components/AgeCounter";

export const Route = createFileRoute("/_authenticated/recharges")({
  ssr: false,
  component: RechargesPage,
});

function RechargesPage() {
  const { data } = useQuery({
    queryKey: ["recharges-all"],
    queryFn: async () => (await supabase
      .from("recharges")
      .select("*, customers(full_name, mobile, customer_code)")
      .is("deleted_at", null)
      .order("recharge_date", { ascending: false })
      .limit(500)).data ?? [],
  });
  return (
    <>
      <PageHeader title="Recharges" description={`${data?.length ?? 0} records (latest 500)`} />
      <div className="p-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>
                <th className="text-left px-4 py-3">Recharge ID</th><th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Customer</th><th className="text-left px-4 py-3">Mobile</th>
                <th className="text-left px-4 py-3">Amount</th><th className="text-left px-4 py-3">Validity</th>
                <th className="text-left px-4 py-3">Expiry</th><th className="text-left px-4 py-3">Mode</th>
                <th className="text-left px-4 py-3">Days Since</th>
              </tr></thead>
              <tbody className="divide-y">
                {data?.map((r: any) => {
                  const days = Math.floor((Date.now() - new Date(r.recharge_date).getTime()) / 86400000);
                  const flag = days >= 30 ? "ready_susp" : days >= 25 ? "due_soon" : "ok";
                  return (
                  <tr key={r.id} className="hover:bg-accent/30">
                    <td className="px-4 py-3 font-mono text-xs">{r.recharge_code}</td>
                    <td className="px-4 py-3">{r.recharge_date}</td>
                    <td className="px-4 py-3">
                      <Link to="/customers/$id" params={{ id: r.customer_id }} className="text-primary hover:underline">
                        {r.customers?.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{r.customers?.mobile}</td>
                    <td className="px-4 py-3 font-semibold">{formatINR(Number(r.plan_amount))}</td>
                    <td className="px-4 py-3">{r.validity_days}d</td>
                    <td className="px-4 py-3">{r.expiry_date}</td>
                    <td className="px-4 py-3 capitalize">{r.payment_mode}</td>
                    <td className="px-4 py-3">
                      <AgeCounter from={r.recharge_date} warnAfter={25} dangerAfter={30} />
                      {flag === "ready_susp" && <span className="ml-1 text-[10px] font-semibold text-destructive">SUSPEND</span>}
                      {flag === "due_soon" && <span className="ml-1 text-[10px] font-semibold text-warning-foreground">DUE</span>}
                    </td>
                  </tr>
                  );
                })}
                {(data?.length ?? 0) === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No recharges yet. Add one from a customer's page.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
