import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Wifi, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash and emits PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. Please sign in.");
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--gradient-primary)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6 text-primary-foreground">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 backdrop-blur mb-3">
            <Wifi className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold">Set a new password</h1>
          <p className="text-sm opacity-90">Choose a strong password you haven't used before.</p>
        </div>
        <Card className="p-6 shadow-2xl">
          {!ready ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Validating reset link… If this hangs, the link may have expired. Request a new one from the sign-in page.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rp-pw">New Password</Label>
                <div className="relative">
                  <Input id="rp-pw" type={showPw ? "text" : "password"} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-foreground" aria-label="Toggle password">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rp-confirm">Confirm Password</Label>
                <Input id="rp-confirm" type={showPw ? "text" : "password"} required minLength={6} value={confirm} onChange={e => setConfirm(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>{saving ? "Updating…" : "Update password"}</Button>
              <button type="button" onClick={() => navigate({ to: "/auth" })} className="text-xs text-muted-foreground hover:text-foreground w-full text-center">
                Back to sign in
              </button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
