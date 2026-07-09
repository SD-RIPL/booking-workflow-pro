import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/audit")({
  ssr: false,
  component: AuditPage,
});

function AuditPage() {
  const { data } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => (await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500)).data ?? [],
  });
  return (
    <>
      <PageHeader title="Audit Log" description="Every change tracked (admin & manager only)" />
      <div className="p-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>
                <th className="text-left px-4 py-3">When</th><th className="text-left px-4 py-3">Module</th>
                <th className="text-left px-4 py-3">Action</th><th className="text-left px-4 py-3">Entity</th>
                <th className="text-left px-4 py-3">User</th>
              </tr></thead>
              <tbody className="divide-y">
                {data?.map((a: any) => (
                  <tr key={a.id} className="hover:bg-accent/30">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 capitalize">{a.module}</td>
                    <td className="px-4 py-3 font-medium capitalize">{a.action}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.entity_id?.slice(0, 8) ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.user_id?.slice(0, 8) ?? "—"}</td>
                  </tr>
                ))}
                {(data?.length ?? 0) === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No audit entries yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
