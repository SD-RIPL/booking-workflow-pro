import { useAccess } from "@/lib/access";

export function useIsAdmin(userId: string | undefined) {
  const q = useAccess(userId);
  const role = q.data?.role;
  return {
    ...q,
    isAdmin: role === "super_admin" || role === "admin",
    isSuperAdmin: role === "super_admin",
    role,
  };
}
