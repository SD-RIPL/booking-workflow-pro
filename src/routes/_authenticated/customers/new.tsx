import { createFileRoute, Navigate } from "@tanstack/react-router";

// Manual customer creation has been removed.
// Customers are now created automatically after Security Deposit is saved
// during the Booking workflow. This route redirects to /bookings/new.
export const Route = createFileRoute("/_authenticated/customers/new")({
  ssr: false,
  component: () => <Navigate to="/bookings/new" replace />,
});
