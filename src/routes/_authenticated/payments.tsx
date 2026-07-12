import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { formatINR } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/payments")({
  ssr: false,
  component: PaymentsPage,
});

function PaymentsPage() {
  const { data } = useQuery({
    queryKey: ["payments-all"],
    queryFn: async () => (await supabase
      .from("payments").is("deleted_at", null)
      .select("*, customers(full_name, mobile, customer_code)")
      .order("collection_date", { ascending: false })
      .limit(500)).data ?? [],
  });
  const total = (data ?? []).reduce((s: number, p: any) => s + Number(p.total_amount || 0), 0);
  return (
    <>
      <PageHeader title="Payments" description={`${data?.length ?? 0} records · Total: ${formatINR(total)}`} />
      <div className="p-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>
                <th className="text-left px-4 py-3">Payment ID</th><th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Customer</th><th className="text-left px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">GST</th><th className="text-left px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Mode</th><th className="text-left px-4 py-3">Reference</th>
              </tr></thead>
              <tbody className="divide-y">
                {data?.map((p: any) => (
                  <tr key={p.id} className="hover:bg-accent/30">
                    <td className="px-4 py-3 font-mono text-xs">{p.payment_code}</td>
                    <td className="px-4 py-3">{p.collection_date}</td>
                    <td className="px-4 py-3">
                      <Link to="/customers/$id" params={{ id: p.customer_id }} className="text-primary hover:underline">
                        {p.customers?.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{formatINR(Number(p.amount))}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatINR(Number(p.gst))}</td>
                    <td className="px-4 py-3 font-semibold">{formatINR(Number(p.total_amount))}</td>
                    <td className="px-4 py-3 capitalize">{p.mode}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.reference_number ?? "—"}</td>
                  </tr>
                ))}
                {(data?.length ?? 0) === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No payments recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
