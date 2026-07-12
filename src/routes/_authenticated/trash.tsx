import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TRASH_TABLES, TRASH_LABEL, restoreRow, purgeRow, type TrashTable } from "@/lib/softDelete";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";
import { Trash2, RotateCcw, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/trash")({
  ssr: false,
  component: TrashPage,
});

function TrashPage() {
  const { user } = Route.useRouteContext();
  const { isAdmin, isSuperAdmin, isLoading } = useIsAdmin(user.id);
  const [tab, setTab] = useState<TrashTable>("customers");

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) {
    return (
      <div className="p-10 text-center">
        <Lock className="w-10 h-10 mx-auto text-destructive mb-3" />
        <h2 className="text-xl font-semibold">Admin only</h2>
        <p className="text-sm text-muted-foreground mt-2">Only Admins can access the Trash / Restore area.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Trash & Restore" description="Deleted records — restore or permanently remove." />
      <div className="p-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TrashTable)}>
          <TabsList className="flex flex-wrap gap-1">
            {TRASH_TABLES.map((t) => (
              <TabsTrigger key={t} value={t}>{TRASH_LABEL[t]}</TabsTrigger>
            ))}
          </TabsList>
          {TRASH_TABLES.map((t) => (
            <TabsContent key={t} value={t}>
              <DeletedList table={t} canPurge={isSuperAdmin} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
}

function DeletedList({ table, canPurge }: { table: TrashTable; canPurge: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["trash", table],
    queryFn: async () => {
      const { data, error } = await (supabase.from(table as any) as any)
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function handleRestore(id: string) {
    try {
      await restoreRow(table, id);
      toast.success("Restored");
      qc.invalidateQueries({ queryKey: ["trash", table] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function handlePurge(id: string) {
    if (!confirm("Permanently delete? This cannot be undone.")) return;
    try {
      await purgeRow(table, id);
      toast.success("Permanently deleted");
      qc.invalidateQueries({ queryKey: ["trash", table] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <Card className="mt-4 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">ID</th>
              <th className="text-left px-4 py-3">Name / Code</th>
              <th className="text-left px-4 py-3">Deleted at</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Trash is empty.</td></tr>
            )}
            {data?.map((r: any) => (
              <tr key={r.id} className="hover:bg-accent/30">
                <td className="px-4 py-3 font-mono text-xs">{r.id.slice(0, 8)}…</td>
                <td className="px-4 py-3">
                  {r.full_name ?? r.booking_code ?? r.customer_code ?? r.sim_number ?? r.serial_number ?? r.recharge_code ?? r.payment_code ?? r.title ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.deleted_at ? new Date(r.deleted_at).toLocaleString() : "—"}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Button size="sm" variant="outline" onClick={() => handleRestore(r.id)}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restore
                  </Button>
                  {canPurge && (
                    <Button size="sm" variant="destructive" onClick={() => handlePurge(r.id)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Purge
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
