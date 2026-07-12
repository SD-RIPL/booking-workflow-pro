import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download } from "lucide-react";
import { daysUntil } from "@/lib/crm";
import { exportToCsv } from "@/lib/exportCsv";
import { BulkToolbar } from "@/components/BulkToolbar";
import { softDeleteMany } from "@/lib/softDelete";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/customers/")({
  ssr: false,
  component: CustomersList,
});

const EXPORT_COLS = [
  { key: "customer_code", label: "Customer ID" },
  { key: "full_name", label: "Name" },
  { key: "mobile", label: "Mobile" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "current_expiry_date", label: "Expiry" },
  { key: "status", label: "Status" },
];

function CustomersList() {
  const { user } = Route.useRouteContext();
  const { isAdmin } = useIsAdmin(user.id);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["customers", q, status],
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select("*, bookings!inner(sd_status)")
        .eq("bookings.sd_status", "received")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (status !== "all") query = query.eq("status", status as any);
      if (q) query = query.or(`full_name.ilike.%${q}%,mobile.ilike.%${q}%,customer_code.ilike.%${q}%`);
      const { data } = await query;
      return data ?? [];
    },
  });

  const selectedRows = (data ?? []).filter((r: any) => selected.has(r.id));

  async function bulkDelete() {
    if (!confirm(`Delete ${selected.size} customer(s)?`)) return;
    try {
      await softDeleteMany("customers", Array.from(selected));
      toast.success("Deleted (moved to Trash)");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description={`${data?.length ?? 0} records`}
        actions={<Button variant="outline" size="sm" onClick={() => exportToCsv("customers", data ?? [], EXPORT_COLS)}>
          <Download className="w-4 h-4 mr-1" /> Export CSV
        </Button>}
      />

      <BulkToolbar
        selectedCount={selected.size}
        rows={selectedRows}
        columns={EXPORT_COLS}
        filename="customers-selected"
        canDelete={isAdmin}
        onDelete={bulkDelete}
        onClear={() => setSelected(new Set())}
      />

      <div className="p-6 space-y-4">
        <Card className="p-3 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name, mobile, customer ID…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="due_soon">Due Soon</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="disconnected">Disconnected</SelectItem>
              <SelectItem value="blacklisted">Blacklisted</SelectItem>
            </SelectContent>
          </Select>
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 w-8"><Checkbox
                    checked={(data?.length ?? 0) > 0 && selected.size === data!.length}
                    onCheckedChange={(c) => setSelected(c ? new Set((data ?? []).map((r: any) => r.id)) : new Set())}
                  /></th>
                  <th className="text-left px-4 py-3">Customer ID</th>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Mobile</th>
                  <th className="text-left px-4 py-3">City / State</th>
                  <th className="text-left px-4 py-3">Expiry</th>
                  <th className="text-left px-4 py-3">Days Left</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
                {!isLoading && (data?.length ?? 0) === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No customers found.</td></tr>}
                {data?.map((c: any) => {
                  const dl = daysUntil(c.current_expiry_date);
                  return (
                    <tr key={c.id} className="hover:bg-accent/30">
                      <td className="px-3 py-3"><Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={(v) => {
                          const n = new Set(selected);
                          if (v) n.add(c.id); else n.delete(c.id);
                          setSelected(n);
                        }}
                      /></td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link to="/customers/$id" params={{ id: c.id }} className="text-primary hover:underline">{c.customer_code}</Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{c.full_name}</td>
                      <td className="px-4 py-3">{c.mobile}</td>
                      <td className="px-4 py-3 text-muted-foreground">{[c.city, c.state].filter(Boolean).join(", ") || "—"}</td>
                      <td className="px-4 py-3">{c.current_expiry_date ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums">{dl ?? "—"}</td>
                      <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
