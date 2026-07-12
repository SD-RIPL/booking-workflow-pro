import { supabase } from "@/integrations/supabase/client";

export type TrashTable =
  | "customers"
  | "bookings"
  | "recharges"
  | "payments"
  | "tickets"
  | "sims"
  | "routers"
  | "suspensions";

export const TRASH_TABLES: TrashTable[] = [
  "customers", "bookings", "recharges", "payments", "tickets", "sims", "routers", "suspensions",
];

export const TRASH_LABEL: Record<TrashTable, string> = {
  customers: "Customers",
  bookings: "Bookings",
  recharges: "Recharges",
  payments: "Payments",
  tickets: "Tickets",
  sims: "SIMs",
  routers: "Routers",
  suspensions: "Suspensions",
};

export async function softDelete(table: TrashTable, id: string) {
  const { error } = await supabase.rpc("soft_delete_row" as any, { _table: table, _id: id });
  if (error) throw error;
}

export async function restoreRow(table: TrashTable, id: string) {
  const { error } = await supabase.rpc("restore_row" as any, { _table: table, _id: id });
  if (error) throw error;
}

export async function purgeRow(table: TrashTable, id: string) {
  const { error } = await supabase.rpc("purge_row" as any, { _table: table, _id: id });
  if (error) throw error;
}

export async function softDeleteMany(table: TrashTable, ids: string[]) {
  for (const id of ids) await softDelete(table, id);
}
