import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Sparkles, Timer, BookOpen, AlertTriangle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import { Button, Input } from "../components/ui";

interface DemoAccount {
  email: string;
  name: string;
  role: string;
  title: string | null;
  password: string;
}

const HIGHLIGHTS = [
  { icon: Sparkles, title: "AI triage", body: "Category, priority and sentiment on arrival" },
  { icon: BookOpen, title: "RAG replies", body: "Drafts grounded in salon policy" },
  { icon: Timer, title: "SLA clocks", body: "Live countdowns per priority" },
  { icon: AlertTriangle, title: "Escalation", body: "Auto-routing with Slack alerts" },
];

export function LoginPage() {
  const { login, runtime } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    api
      .get<{ accounts: DemoAccount[] }>("/auth/demo-accounts")
      .then((r) => {
        setAccounts(r.accounts);
        // Pre-fill the first demo account so the desk is one click away.
        if (r.accounts[0]) {
          setEmail(r.accounts[0].email);
          setPassword(r.accounts[0].password);
        }
      })
      .catch(() => setAccounts([]));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Cannot reach the API. Is the backend running on port 4000?",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-luxe-gradient">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-plum-gradient p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 22% 18%, #E39FAF 0, transparent 42%), radial-gradient(circle at 78% 76%, #D4B27A 0, transparent 46%)",
          }}
        />

        <div className="relative">
          <span className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 text-2xl backdrop-blur">
            💅
          </span>
          <p className="font-display text-4xl font-700 tracking-[0.2em] text-white">LUXENAILS</p>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.28em] text-blush-300">
            Mayfair · London
          </p>
        </div>

        <div className="relative">
          <h1 className="max-w-md text-balance font-display text-3xl font-600 leading-tight text-white">
            The client care desk that reads, drafts and escalates for you.
          </h1>
          <div className="mt-10 grid grid-cols-2 gap-5">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/12 text-blush-300">
                  <item.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-blush-300/80">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-blush-300/70">
          Full workflow: message → triage → retrieval → draft → approval → SLA → escalation → resolution
        </p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center px-5 py-10 sm:px-8 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-plum-gradient text-xl shadow-soft">
              💅
            </span>
            <p className="font-display text-2xl font-700 tracking-[0.18em] text-plum-800">LUXENAILS</p>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-400">Client Care Desk</p>
          </div>

          <h2 className="font-display text-2xl font-600 text-plum-800">Welcome back</h2>
          <p className="mt-1.5 text-sm text-ink-400">Sign in to the client care desk.</p>

          {runtime?.demoMode && (
            <div className="mt-5 rounded-xl border border-gold-300/60 bg-gold-300/15 px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-plum-700">
                <Sparkles className="h-3.5 w-3.5" /> Demo Mode active
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                No API keys needed. AI triage, RAG search, reply drafting and Slack alerts all run on
                local engines.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Input
              id="email"
              label="Email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@luxenails.com"
            />
            <Input
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            {error && (
              <div className="rounded-xl border border-rose-400/40 bg-rose-500/8 px-4 py-3 text-sm text-rose-600">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          {accounts.length > 0 && (
            <div className="mt-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                Demo accounts — click to fill
              </p>
              <div className="space-y-2">
                {accounts.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                      setError(null);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-blush-200 bg-white px-4 py-2.5 text-left transition hover:border-blush-300 hover:bg-blush-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-plum-800">{account.name}</p>
                      <p className="truncate text-xs text-ink-400">
                        {account.title ?? account.role} · {account.email}
                      </p>
                    </div>
                    <span className="ml-3 shrink-0 rounded-full bg-blush-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-plum-700">
                      {account.role}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-ink-400">
                Password for every demo account: <code className="font-mono text-plum-700">luxe1234</code>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
