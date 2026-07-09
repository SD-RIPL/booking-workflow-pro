import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/_authenticated/bookings")({
  ssr: false,
  component: BookingsLayout,
});

function BookingsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // /bookings exactly -> list; otherwise render child route
  if (pathname === "/bookings" || pathname === "/bookings/") return <BookingsList />;
  return <Outlet />;
}

const STAGE_LABEL: Record<string, string> = {
  booking: "Booking",
  kyc: "KYC",
  deposit: "Security Deposit",
  router_config: "Router Config",
  dispatch: "Dispatch",
  activation: "Activation",
  completed: "Completed",
};

const STAGE_TONE: Record<string, string> = {
  booking: "bg-muted text-muted-foreground",
  kyc: "bg-amber-100 text-amber-800",
  deposit: "bg-blue-100 text-blue-800",
  router_config: "bg-indigo-100 text-indigo-800",
  dispatch: "bg-purple-100 text-purple-800",
  activation: "bg-teal-100 text-teal-800",
  completed: "bg-emerald-100 text-emerald-800",
};

function BookingsList() {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["bookings-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    return list.filter((b) => {
      if (stage !== "all" && b.workflow_stage !== stage) return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return [b.booking_code, b.full_name, b.mobile, b.email, b.sales_employee]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s));
    });
  }, [data, q, stage]);

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    (data ?? []).forEach((b) => {
      const key = b.workflow_stage ?? "booking";
      c[key] = (c[key] || 0) + 1;
    });
    return c;
  }, [data]);

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Sequential workflow: Booking → KYC → Security Deposit → Router Config → Dispatch → Activation"
        actions={<Link to="/bookings/new"><Button><Plus className="w-4 h-4 mr-2" />New Booking</Button></Link>}
      />
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          {["booking","kyc","deposit","router_config","dispatch","activation","completed"].map((s) => (
            <Card key={s} className="p-3">
              <div className="text-xs text-muted-foreground">{STAGE_LABEL[s]}</div>
              <div className="text-2xl font-bold tabular-nums">{stageCounts[s] ?? 0}</div>
            </Card>
          ))}
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search code, name, mobile, sales emp…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {Object.entries(STAGE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Mobile</th>
                  <th className="py-2 pr-3">Sales</th>
                  <th className="py-2 pr-3">Stage</th>
                  <th className="py-2 pr-3">KYC</th>
                  <th className="py-2 pr-3">SD</th>
                  <th className="py-2 pr-3">Dispatch</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-b hover:bg-muted/40">
                    <td className="py-2 pr-3 font-mono text-xs">
                      <Link to="/bookings/$id" params={{ id: b.id }} className="text-primary hover:underline">{b.booking_code}</Link>
                    </td>
                    <td className="py-2 pr-3">{b.booking_date}</td>
                    <td className="py-2 pr-3">{b.full_name}</td>
                    <td className="py-2 pr-3">{b.mobile}</td>
                    <td className="py-2 pr-3">{b.sales_employee || "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge className={STAGE_TONE[b.workflow_stage ?? "booking"]} variant="secondary">
                        {STAGE_LABEL[b.workflow_stage ?? "booking"]}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 capitalize">{(b.kyc_verification ?? "—").toString().replace("_"," ")}</td>
                    <td className="py-2 pr-3 capitalize">{(b.sd_status ?? "—").toString().replace("_"," ")}</td>
                    <td className="py-2 pr-3 capitalize">{b.dispatch_status ?? "—"}</td>
                  </tr>
                ))}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No bookings yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {isLoading && <p className="text-sm text-muted-foreground mt-2">Loading…</p>}
        </Card>
      </div>
    </>
  );
}
