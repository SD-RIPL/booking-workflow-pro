import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/crm";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  ssr: false,
  component: ReportsPage,
});

function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);

  const { data: payments } = useQuery({
    queryKey: ["report-payments", from, to],
    queryFn: async () => (await supabase.from("payments")
      .select("payment_code, collection_date, total_amount, mode, customers(full_name, customer_code, mobile, state)")
      .gte("collection_date", from).lte("collection_date", to)
      .order("collection_date", { ascending: false })).data ?? [],
  });

  const total = (payments ?? []).reduce((s: number, p: any) => s + Number(p.total_amount || 0), 0);

  function exportCsv() {
    const rows = [["Payment ID", "Date", "Customer", "Customer ID", "Mobile", "State", "Mode", "Amount"]];
    (payments ?? []).forEach((p: any) => rows.push([
      p.payment_code, p.collection_date, p.customers?.full_name ?? "", p.customers?.customer_code ?? "",
      p.customers?.mobile ?? "", p.customers?.state ?? "", p.mode, String(p.total_amount),
    ]));
    const csv = rows.map(r => r.map(c => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `collections_${from}_to_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Reports" description="Date-range collection report" actions={<Button onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Export CSV</Button>} />
      <div className="p-6 space-y-4">
        <Card className="p-4 flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5"><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="ml-auto text-right">
            <div className="text-xs text-muted-foreground">Total Collected</div>
            <div className="text-2xl font-bold">{formatINR(total)}</div>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>
                <th className="text-left px-4 py-3">Payment ID</th><th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Customer</th><th className="text-left px-4 py-3">Mobile</th>
                <th className="text-left px-4 py-3">State</th><th className="text-left px-4 py-3">Mode</th>
                <th className="text-left px-4 py-3">Amount</th>
              </tr></thead>
              <tbody className="divide-y">
                {payments?.map((p: any) => (
                  <tr key={p.payment_code}>
                    <td className="px-4 py-3 font-mono text-xs">{p.payment_code}</td>
                    <td className="px-4 py-3">{p.collection_date}</td>
                    <td className="px-4 py-3">{p.customers?.full_name}</td>
                    <td className="px-4 py-3">{p.customers?.mobile}</td>
                    <td className="px-4 py-3">{p.customers?.state ?? "—"}</td>
                    <td className="px-4 py-3 capitalize">{p.mode}</td>
                    <td className="px-4 py-3 font-semibold">{formatINR(Number(p.total_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
