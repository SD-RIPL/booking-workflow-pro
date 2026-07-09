import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Wifi, Eye, EyeOff, ShieldCheck, BarChart3, Users, Zap, IndianRupee, Lock, MailCheck } from "lucide-react";

type InviteSearch = { invite?: string };

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): InviteSearch => ({
    invite: typeof s.invite === "string" ? s.invite : undefined,
  }),
  component: AuthPage,
});

type InviteInfo = { email: string; role: string; valid: boolean; reason: string };

function AuthPage() {
  const navigate = useNavigate();
  const { invite } = useSearch({ from: "/auth" });
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [tab, setTab] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    if (invite) return; // don't auto-redirect; let invite flow run
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate, invite]);

  useEffect(() => {
    if (!invite) { setInviteInfo(null); return; }
    (async () => {
      const { data, error } = await (supabase as any).rpc("validate_invite", { _token: invite });
      if (error) { setInviteInfo({ email: "", role: "", valid: false, reason: error.message }); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { setInviteInfo({ email: "", role: "", valid: false, reason: "not_found" }); return; }
      setInviteInfo({ email: row.email ?? "", role: row.role ?? "", valid: !!row.valid, reason: row.reason ?? "" });
      if (row.email) setEmail(row.email);
      if (row.valid) setTab("signup");
    })();
  }, [invite]);

  async function redeemIfNeeded() {
    if (!invite) return;
    const { error } = await (supabase as any).rpc("redeem_invite", { _token: invite });
    if (error) toast.error(`Invite: ${error.message}`);
    else toast.success("Invite accepted — access granted");
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setLoading(false); return toast.error(error.message); }
    await redeemIfNeeded();
    setLoading(false);
    toast.success("Welcome back");
    navigate({ to: "/dashboard" });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName },
      },
    });
    if (error) { setLoading(false); return toast.error(error.message); }
    // If session was created immediately (auto-confirm), redeem + go to dashboard.
    if (data.session) {
      await redeemIfNeeded();
      setLoading(false);
      toast.success("Account created");
      navigate({ to: "/dashboard" });
      return;
    }
    setLoading(false);
    toast.success("Account created. Check your email to verify, then sign in here to activate your invite.");
    setTab("signin");
  }


  const pwScore = scorePassword(password);

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: "var(--gradient-primary)" }}>
      {/* Brand / feature side */}
      <div className="hidden lg:flex flex-col justify-between p-12 text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(circle at 20% 20%, white, transparent 40%), radial-gradient(circle at 80% 70%, white, transparent 35%)" }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Wifi className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg font-bold leading-tight">Rishishwar Industry</div>
              <div className="text-xs opacity-80">Private Limited · ISP Operations</div>
            </div>
          </div>
        </div>

        <div className="relative space-y-8">
          <div>
            <h2 className="text-4xl font-bold leading-tight">All your ISP operations.<br />One control center.</h2>
            <p className="mt-3 text-base opacity-90 max-w-md">
              Customers, recharges, SIMs, routers, payments, and revenue — automated, audited, and always in sync.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <Feature icon={Users} title="Customer 360" desc="Full lifecycle, KYC, history" />
            <Feature icon={Zap} title="Auto Recharges" desc="Expiry & status managed" />
            <Feature icon={IndianRupee} title="Revenue Tracking" desc="Live GST-ready totals" />
            <Feature icon={BarChart3} title="Reports" desc="Exportable analytics" />
          </div>
        </div>

        <div className="relative flex items-center gap-6 text-xs opacity-90">
          <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Encrypted & audited</span>
          <span className="flex items-center gap-1.5"><Lock className="w-4 h-4" /> Role-based access</span>
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-6 text-primary-foreground lg:hidden">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 backdrop-blur mb-3">
              <Wifi className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold">Rishishwar Industry</h1>
            <p className="text-sm opacity-90">ISP CRM & Billing Portal</p>
          </div>

          <Card className="p-6 shadow-2xl border-0">
            <div className="mb-5">
              <h2 className="text-xl font-bold">Welcome</h2>
              <p className="text-sm text-muted-foreground">Sign in to manage your network operations.</p>
            </div>

            {invite && inviteInfo && (
              <div className={`mb-4 rounded-lg border p-3 text-sm ${inviteInfo.valid ? "bg-primary/5 border-primary/30" : "bg-destructive/5 border-destructive/30"}`}>
                {inviteInfo.valid ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      <MailCheck className="w-4 h-4 text-primary" /> You're invited
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sign up (or sign in if you already have an account) with <span className="font-mono">{inviteInfo.email}</span> and you'll be granted the <Badge variant="secondary" className="ml-1 text-[10px]">{inviteInfo.role}</Badge> role automatically.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="font-medium">Invite link is not usable</div>
                    <p className="text-xs text-muted-foreground">Reason: {inviteInfo.reason}. Ask your admin for a fresh invite link.</p>
                  </div>
                )}
              </div>
            )}

            <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
              <TabsList className="grid grid-cols-2 w-full mb-4">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="si-email">Email</Label>
                    <Input id="si-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" readOnly={!!(invite && inviteInfo?.valid)} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="si-pw">Password</Label>
                      <ForgotPasswordDialog defaultEmail={email} />
                    </div>
                    <div className="relative">
                      <Input id="si-pw" type={showPw ? "text" : "password"} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
                      <button type="button" onClick={() => setShowPw(v => !v)} className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-foreground" aria-label="Toggle password">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Full Name</Label>
                    <Input id="su-name" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">Email</Label>
                    <Input id="su-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" readOnly={!!(invite && inviteInfo?.valid)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-pw">Password</Label>
                    <div className="relative">
                      <Input id="su-pw" type={showPw ? "text" : "password"} autoComplete="new-password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
                      <button type="button" onClick={() => setShowPw(v => !v)} className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-foreground" aria-label="Toggle password">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {password && <PasswordMeter score={pwScore} />}
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating..." : "Create Account"}</Button>
                  {!invite && (
                    <p className="text-xs text-muted-foreground text-center">First account becomes the Admin automatically.</p>
                  )}
                </form>
              </TabsContent>
            </Tabs>
          </Card>

          <p className="text-xs text-center mt-4 text-primary-foreground/80">
            © {new Date().getFullYear()} Rishishwar Industry Pvt. Ltd.
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs opacity-80">{desc}</div>
      </div>
    </div>
  );
}

function scorePassword(pw: string) {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

function PasswordMeter({ score }: { score: number }) {
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Excellent"];
  const colors = ["bg-destructive", "bg-destructive", "bg-warning", "bg-info", "bg-success"];
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded ${i < score ? colors[score] : "bg-muted"}`} />
        ))}
      </div>
      <div className="text-xs text-muted-foreground">{labels[score]}</div>
    </div>
  );
}

function ForgotPasswordDialog({ defaultEmail }: { defaultEmail: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);

  useEffect(() => { setEmail(defaultEmail); }, [defaultEmail]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset link sent. Check your inbox.");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-xs text-primary hover:underline">Forgot password?</button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset your password</DialogTitle>
          <DialogDescription>Enter your account email and we'll send you a secure link to set a new password.</DialogDescription>
        </DialogHeader>
        <form onSubmit={send} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fp-email">Email</Label>
            <Input id="fp-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={sending}>{sending ? "Sending…" : "Send reset link"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
