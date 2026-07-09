import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/_authenticated/suspensions")({
  ssr: false,
  component: SuspensionsPage,
});

function SuspensionsPage() {
  const { data } = useQuery({
    queryKey: ["suspensions"],
    queryFn: async () => (await supabase.from("suspensions").select("*, customers(full_name, customer_code, mobile, status)").order("suspended_at", { ascending: false })).data ?? [],
  });
  return (
    <>
      <PageHeader title="Service Suspensions" description={`${data?.length ?? 0} records`} />
      <div className="p-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>
                <th className="text-left px-4 py-3">Customer</th><th className="text-left px-4 py-3">Mobile</th>
                <th className="text-left px-4 py-3">Suspended</th><th className="text-left px-4 py-3">Resumed</th>
                <th className="text-left px-4 py-3">Reason</th><th className="text-left px-4 py-3">Status</th>
              </tr></thead>
              <tbody className="divide-y">
                {data?.map((s: any) => (
                  <tr key={s.id} className="hover:bg-accent/30">
                    <td className="px-4 py-3">
                      <Link to="/customers/$id" params={{ id: s.customer_id }} className="text-primary hover:underline">{s.customers?.full_name}</Link>
                      <div className="text-xs text-muted-foreground font-mono">{s.customers?.customer_code}</div>
                    </td>
                    <td className="px-4 py-3">{s.customers?.mobile}</td>
                    <td className="px-4 py-3">{new Date(s.suspended_at).toLocaleString()}</td>
                    <td className="px-4 py-3">{s.resumed_at ? new Date(s.resumed_at).toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.reason ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.customers?.status} /></td>
                  </tr>
                ))}
                {(data?.length ?? 0) === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No suspensions recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
