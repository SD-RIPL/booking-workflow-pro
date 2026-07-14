# Security Memory

## App context
Internal CRM for an ISP/broadband company. Every authenticated user is a company operator (sales/support/finance/ops/admin). There are no external end-customers signing in — customers exist only as records in `public.customers`. Sensitive fields include aadhaar_no, kyc_number, mobile, email, address, router credentials, and financial transactions.

## Authorization model — do not re-flag
- `user_roles` + `has_role`/`has_any_role` (SECURITY DEFINER, search_path=public) is the canonical Supabase user-roles pattern. Do NOT flag these as SECURITY DEFINER bypass or recommend SECURITY INVOKER — that reintroduces RLS recursion on `user_roles`.
- `is_staff(uid)` returns true for anyone with any row in `user_roles`. This is intentional: staff need cross-record visibility to operate the pipeline. Fine-grained gating is done at the module level via `public.user_module_access` + `computeAllowedModules()` in `src/lib/access.ts`, not via per-role SELECT policies. Do NOT flag "any role reads everything" as a vulnerability.
- Destructive/privileged actions (soft_delete_row, restore_row, purge_row, grant_role_by_email, revoke_role, return_router_and_deactivate_sim, bulk_import_bookings, ensure_profile) are SECURITY DEFINER with internal `has_any_role`/`has_role` checks. They are the intended gate. Do NOT recommend removing SECURITY DEFINER on them.
- `validate_invite(text)` is intentionally granted to `anon` — the invite acceptance page must resolve a token before the invitee has an account. It only returns the invite's email/role and enforces revoked/used/expired internally. Do NOT flag anon-executable SECURITY DEFINER for this specific function.
- All other SECURITY DEFINER functions are granted only to `authenticated`.

## Profiles table
- SELECT policy `profiles_read_own`: user reads own row; super_admin/admin read all. Do not re-add a permissive `USING (true)` policy.

## Deletion
- Explicit DELETE policies on customers, bookings, recharges, payments, security_deposits, tickets, ticket_updates, sims, routers, suspensions, notifications, invitations, booking_stage_history are restricted to super_admin/admin. Soft-delete workflow is preferred (deleted_at column + Trash page); direct DELETE is admin-only fallback.

## Out of scope for this app — do not flag
- Rate limiting / brute-force on auth or RPCs (handled by Supabase Auth defaults).
- Timing-safe equality on token comparison.
- Iframe/frame-ancestors hardening (would break Lovable preview).
- Column-level masking of PII for staff (staff need PII to operate).
