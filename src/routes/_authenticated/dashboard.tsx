import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { formatINR } from "@/lib/crm";
import {
  Users, UserCheck, AlertTriangle, XCircle, PauseCircle, IndianRupee,
  Smartphone, Router as RouterIcon, TrendingUp, Clock, ShieldAlert,
} from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Line, LineChart } from "recharts";
import { useEffect } from "react";
import { AgeCounter } from "@/components/AgeCounter";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  component: Dashboard,
});

function Dashboard() {
  // refresh statuses once on mount
  useEffect(() => { supabase.rpc("refresh_customer_statuses"); }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [cust, sims, routers, recharges, payments, bookings, tickets] = await Promise.all([
        supabase.from("customers").select("status,state,city,current_expiry_date,created_at,sim_id,due_soon_flag,ready_for_suspension,days_since_last_recharge,full_name,mobile,id"),
        supabase.from("sims").select("status,company"),
        supabase.from("routers").select("status"),
        supabase.from("recharges").select("plan_amount,recharge_date"),
        supabase.from("payments").select("total_amount,collection_date"),
        supabase.from("bookings").select("id,full_name,workflow_stage,created_at").neq("workflow_stage", "completed").order("created_at", { ascending: true }).limit(5),
        supabase.from("tickets").select("id,ticket_code,subject,created_at,status").in("status", ["open","in_progress"]).order("created_at", { ascending: true }).limit(5),
      ]);
      return {
        customers: cust.data ?? [],
        sims: sims.data ?? [],
        routers: routers.data ?? [],
        recharges: recharges.data ?? [],
        payments: payments.data ?? [],
        pendingBookings: bookings.data ?? [],
        openTickets: tickets.data ?? [],
      };
    },
  });

  const stats = computeStats(data);

  return (
    <>
      <PageHeader title="Dashboard" description="Real-time overview of the entire ISP operation" />
      <div className="p-6 space-y-6">
        {/* Top KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi icon={Users} label="Total Customers" value={stats.total} tone="info" />
          <Kpi icon={UserCheck} label="Active" value={stats.active} tone="success" />
          <Kpi icon={AlertTriangle} label="Due Soon" value={stats.dueSoon} tone="warning" />
          <Kpi icon={XCircle} label="Expired" value={stats.expired} tone="destructive" />
          <Kpi icon={PauseCircle} label="Suspended" value={stats.suspended} tone="muted" />
          <Kpi icon={TrendingUp} label="New This Month" value={stats.newThisMonth} tone="info" />
        </div>

        {/* Recharge automation flags */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={Clock} label="25-Day Due Soon" value={stats.rechargeDueSoon} tone="warning" />
          <Kpi icon={ShieldAlert} label="30-Day Ready for Suspension" value={stats.readyForSuspension} tone="destructive" />
          <Kpi icon={AlertTriangle} label="Pending Bookings" value={(data?.pendingBookings ?? []).length} tone="warning" />
          <Kpi icon={AlertTriangle} label="Open Tickets" value={(data?.openTickets ?? []).length} tone="info" />
        </div>

        {/* Age counters — oldest pending items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4" />Oldest Pending Bookings</h3>
            <div className="space-y-2">
              {(data?.pendingBookings ?? []).map((b: any) => (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{b.full_name}</div>
                    <div className="text-xs text-muted-foreground capitalize">Stage: {b.workflow_stage}</div>
                  </div>
                  <AgeCounter from={b.created_at} warnAfter={3} dangerAfter={7} />
                </div>
              ))}
              {(data?.pendingBookings ?? []).length === 0 && <p className="text-xs text-muted-foreground">No pending bookings.</p>}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4" />Oldest Open Tickets</h3>
            <div className="space-y-2">
              {(data?.openTickets ?? []).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium font-mono text-xs">{t.ticket_code}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">{t.subject}</div>
                  </div>
                  <AgeCounter from={t.created_at} warnAfter={2} dangerAfter={5} />
                </div>
              ))}
              {(data?.openTickets ?? []).length === 0 && <p className="text-xs text-muted-foreground">No open tickets.</p>}
            </div>
          </Card>
        </div>

        {/* Revenue cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <RevenueCard label="Today" value={stats.revToday} />
          <RevenueCard label="This Week" value={stats.revWeek} />
          <RevenueCard label="This Month" value={stats.revMonth} />
          <RevenueCard label="Lifetime" value={stats.revAll} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 p-5">
            <h3 className="font-semibold mb-4">Revenue — Last 14 days</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: number) => formatINR(v)} />
                  <Line type="monotone" dataKey="amount" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Inventory</h3>
            <div className="space-y-3 text-sm">
              <Row icon={Smartphone} label="SIMs Available" value={stats.simsAvailable} />
              <Row icon={Smartphone} label="SIMs Assigned" value={stats.simsAssigned} />
              <Row icon={Smartphone} label="Airtel" value={stats.simsAirtel} />
              <Row icon={Smartphone} label="Vi" value={stats.simsVi} />
              <div className="border-t my-2" />
              <Row icon={RouterIcon} label="Routers in Stock" value={stats.routersStock} />
              <Row icon={RouterIcon} label="Routers Assigned" value={stats.routersAssigned} />
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="font-semibold mb-4">Recharge Volume — Last 14 days</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.dailyRecharges}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--color-primary-glow)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      </div>
    </>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: number; tone: string }) {
  const toneMap: Record<string, string> = {
    success: "text-success bg-success/10",
    warning: "text-warning-foreground bg-warning/20",
    destructive: "text-destructive bg-destructive/10",
    info: "text-info bg-info/10",
    muted: "text-muted-foreground bg-muted",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</div>
        </div>
      </div>
    </Card>
  );
}

function RevenueCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4 text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
      <div className="flex items-center gap-2 text-xs opacity-90">
        <IndianRupee className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{formatINR(value)}</div>
    </Card>
  );
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground"><Icon className="w-4 h-4" />{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function computeStats(data: any) {
  const customers = data?.customers ?? [];
  const sims = data?.sims ?? [];
  const routers = data?.routers ?? [];
  const recharges = data?.recharges ?? [];
  const payments = data?.payments ?? [];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6);

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const last14: { day: string; amount: number; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    last14.push({ day: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), amount: 0, count: 0 });
  }
  const idxFor = (dateStr: string) => {
    const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
    return 13 - diff;
  };

  let revToday = 0, revWeek = 0, revMonth = 0, revAll = 0;
  for (const p of payments) {
    const amt = Number(p.total_amount) || 0;
    revAll += amt;
    const d = new Date(p.collection_date); d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) revToday += amt;
    if (d >= weekAgo) revWeek += amt;
    if (d >= startOfMonth) revMonth += amt;
    const i = idxFor(p.collection_date);
    if (i >= 0 && i < 14) last14[i].amount += amt;
  }
  for (const r of recharges) {
    const i = idxFor(r.recharge_date);
    if (i >= 0 && i < 14) last14[i].count += 1;
  }

  return {
    total: customers.length,
    active: customers.filter((c: any) => c.status === "active").length,
    dueSoon: customers.filter((c: any) => c.status === "due_soon").length,
    expired: customers.filter((c: any) => c.status === "expired").length,
    suspended: customers.filter((c: any) => c.status === "suspended").length,
    newThisMonth: customers.filter((c: any) => new Date(c.created_at) >= startOfMonth).length,
    rechargeDueSoon: customers.filter((c: any) => c.due_soon_flag).length,
    readyForSuspension: customers.filter((c: any) => c.ready_for_suspension).length,
    revToday, revWeek, revMonth, revAll,
    simsAvailable: sims.filter((s: any) => s.status === "available").length,
    simsAssigned: sims.filter((s: any) => s.status !== "available").length,
    simsAirtel: sims.filter((s: any) => s.company === "airtel").length,
    simsVi: sims.filter((s: any) => s.company === "vi").length,
    routersStock: routers.filter((r: any) => r.status === "in_stock").length,
    routersAssigned: routers.filter((r: any) => r.status !== "in_stock").length,
    dailyRevenue: last14.map(d => ({ day: d.day, amount: d.amount })),
    dailyRecharges: last14.map(d => ({ day: d.day, count: d.count })),
  };
}
