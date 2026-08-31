import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, Database, KeyRound, RefreshCw, Save, Server, Settings as SettingsIcon, Shield, Sparkles, Timer, Users, Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { cn, duration } from "../lib/format";
import {
  Badge, Button, Card, ErrorState, Input, LoadingBlock, SectionHeader,
} from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { PRIORITY_STYLE } from "../lib/tokens";
import type { RuntimeConfig, SlaPolicy } from "../lib/types";

interface SettingsData {
  runtime: RuntimeConfig;
  preferences: Record<string, unknown>;
  policies: SlaPolicy[];
  index: { articles: number; chunks: number; dims: number };
  team: { activeUsers: number };
  environment: { nodeEnv: string; anthropicKeyPresent: boolean; slackWebhookPresent: boolean };
}

const TOGGLES = [
  { key: "autoTriageOnIntake", label: "Auto-triage on arrival", hint: "Classify every new ticket the moment it lands." },
  { key: "requireApprovalBeforeSend", label: "Require agent approval", hint: "AI replies never send without a human clicking approve." },
  { key: "slackAlertsEnabled", label: "Slack alerts", hint: "Post to Slack whenever a ticket escalates." },
  { key: "escalateOnAngrySentiment", label: "Escalate on angry sentiment", hint: "Route furious customers straight to a manager." },
  { key: "autoDraftOnTriage", label: "Auto-draft after triage", hint: "Generate a reply draft as soon as a ticket is classified." },
];

export function SettingsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [prefs, setPrefs] = useState<Record<string, unknown> | null>(null);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsData>("/settings"),
  });

  const effective = prefs ?? data?.preferences ?? {};
  const isAdmin = user?.role === "ADMIN" || user?.role === "MANAGER";

  const savePrefs = useMutation({
    mutationFn: () => api.put("/settings/preferences", effective),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setPrefs(null);
      toast.success("Preferences saved");
    },
    onError: (err: Error) => toast.error("Could not save", err.message),
  });

  const testAi = useMutation({
    mutationFn: () => api.post<{ ok: boolean; message: string; model: string }>("/settings/test-ai"),
    onSuccess: (result) =>
      result.ok ? toast.success("AI connection", result.message) : toast.error("AI connection failed", result.message),
    onError: (err: Error) => toast.error("Test failed", err.message),
  });

  const reindex = useMutation({
    mutationFn: () => api.post<{ articles: number; chunks: number; tookMs: number }>("/settings/reindex"),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["kb"] });
      toast.success("Index rebuilt", `${result.chunks} chunks in ${result.tookMs}ms`);
    },
    onError: (err: Error) => toast.error("Reindex failed", err.message),
  });

  const changePassword = useMutation({
    mutationFn: () => api.post("/auth/change-password", passwords),
    onSuccess: () => {
      setPasswords({ currentPassword: "", newPassword: "" });
      toast.success("Password updated");
    },
    onError: (err: Error) => toast.error("Could not change password", err.message),
  });

  if (isLoading) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-600 text-plum-800">Settings</h1>
        <p className="mt-1 text-sm text-ink-400">Runtime configuration, workflow rules and your account</p>
      </div>

      {/* Runtime */}
      <Card className="p-5">
        <SectionHeader
          title="Runtime"
          subtitle="Read from the server environment — edit backend/.env to change"
          icon={<Server className="h-4.5 w-4.5" />}
        />

        {data.runtime.demoMode && (
          <div className="mb-4 rounded-xl border border-gold-300/60 bg-gold-300/15 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-plum-700">
              <Sparkles className="h-3.5 w-3.5" /> Demo Mode is on
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              Every AI capability runs on a local deterministic engine and Slack alerts are captured in the
              in-app outbox. To use Claude, put a key in <code className="font-mono">ANTHROPIC_API_KEY</code>{" "}
              and set <code className="font-mono">DEMO_MODE=false</code>, then restart the API.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: "AI provider", value: data.runtime.aiProvider, icon: Sparkles },
            { label: "Model", value: data.runtime.aiModel, icon: Zap },
            { label: "Reasoning effort", value: data.runtime.aiEffort, icon: Zap },
            { label: "Environment", value: data.environment.nodeEnv, icon: Server },
            {
              label: "Slack",
              value: data.runtime.slackConfigured
                ? `Live → ${data.runtime.slackChannel}`
                : `Simulated (${data.runtime.slackChannel})`,
              icon: Shield,
            },
            { label: "SLA scan interval", value: `${data.runtime.slaScanIntervalSeconds}s`, icon: Timer },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3 rounded-xl border border-blush-100 bg-cream-50 px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blush-100 text-rose-400">
                <row.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{row.label}</p>
                <p className="truncate text-sm font-medium text-plum-800">{row.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" loading={testAi.isPending} icon={<Zap className="h-4 w-4" />} onClick={() => testAi.mutate()}>
            Test AI connection
          </Button>
          <div className="flex items-center gap-2">
            <Badge
              className={
                data.environment.anthropicKeyPresent
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-cream-300 bg-cream-200 text-ink-500"
              }
            >
              <KeyRound className="h-3 w-3" />
              ANTHROPIC_API_KEY {data.environment.anthropicKeyPresent ? "set" : "not set"}
            </Badge>
            <Badge
              className={
                data.environment.slackWebhookPresent
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-cream-300 bg-cream-200 text-ink-500"
              }
            >
              <KeyRound className="h-3 w-3" />
              SLACK_WEBHOOK_URL {data.environment.slackWebhookPresent ? "set" : "not set"}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Workflow rules */}
      <Card className="p-5">
        <SectionHeader title="Workflow rules" subtitle="How the desk behaves" icon={<SettingsIcon className="h-4.5 w-4.5" />} />
        <div className="space-y-2">
          {TOGGLES.map((toggle) => {
            const enabled = Boolean(effective[toggle.key]);
            return (
              <label
                key={toggle.key}
                className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-blush-100 bg-cream-50 px-4 py-3 transition hover:border-blush-200"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-plum-800">{toggle.label}</p>
                  <p className="mt-0.5 text-xs text-ink-400">{toggle.hint}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={toggle.label}
                  onClick={() => setPrefs({ ...effective, [toggle.key]: !enabled })}
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition",
                    enabled ? "bg-plum-gradient" : "bg-blush-200",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-all",
                      enabled ? "left-[1.375rem]" : "left-0.5",
                    )}
                  />
                </button>
              </label>
            );
          })}
        </div>
        {prefs && (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPrefs(null)}>Discard</Button>
            <Button loading={savePrefs.isPending} icon={<Save className="h-4 w-4" />} onClick={() => savePrefs.mutate()}>
              Save changes
            </Button>
          </div>
        )}
      </Card>

      {/* SLA targets */}
      <Card className="p-5">
        <SectionHeader title="SLA targets" subtitle="Applied when a ticket is triaged or re-prioritised" icon={<Timer className="h-4.5 w-4.5" />} />
        <div className="space-y-2">
          {data.policies.map((policy) => (
            <div
              key={policy.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blush-100 bg-cream-50 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Badge className={PRIORITY_STYLE[policy.priority].chip} dot={PRIORITY_STYLE[policy.priority].dot}>
                  {PRIORITY_STYLE[policy.priority].label}
                </Badge>
                <p className="text-sm text-ink-600">{policy.name}</p>
              </div>
              <div className="flex gap-5 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">First response</p>
                  <p className="font-semibold tabular-nums text-plum-800">{duration(policy.firstResponseMins)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">Resolution</p>
                  <p className="font-semibold tabular-nums text-plum-800">{duration(policy.resolutionMins)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">Auto-escalate</p>
                  <p className="font-semibold tabular-nums text-plum-800">{duration(policy.escalateAfterMins)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Knowledge index */}
      <Card className="p-5">
        <SectionHeader title="Knowledge index" subtitle="Vector store powering RAG retrieval" icon={<Database className="h-4.5 w-4.5" />} />
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Articles", value: data.index.articles },
            { label: "Embedded chunks", value: data.index.chunks },
            { label: "Vector dimensions", value: data.index.dims },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-blush-100 bg-cream-50 px-4 py-3 text-center">
              <p className="font-display text-2xl font-600 text-plum-800 tabular-nums">{stat.value}</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-400">{stat.label}</p>
            </div>
          ))}
        </div>
        {isAdmin && (
          <Button
            variant="secondary"
            className="mt-4"
            loading={reindex.isPending}
            icon={<RefreshCw className={cn("h-4 w-4", reindex.isPending && "animate-spin")} />}
            onClick={() => reindex.mutate()}
          >
            Rebuild the whole index
          </Button>
        )}
      </Card>

      {/* Account */}
      <Card className="p-5">
        <SectionHeader title="Your account" icon={<Users className="h-4.5 w-4.5" />} />
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Name", value: user?.name ?? "" },
            { label: "Email", value: user?.email ?? "" },
            { label: "Role", value: user?.role ?? "" },
          ].map((row) => (
            <div key={row.label} className="rounded-xl border border-blush-100 bg-cream-50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{row.label}</p>
              <p className="truncate text-sm font-medium text-plum-800">{row.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={passwords.currentPassword}
            onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={passwords.newPassword}
            onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
            hint="At least 8 characters"
          />
        </div>
        <Button
          className="mt-4"
          variant="secondary"
          icon={<Check className="h-4 w-4" />}
          loading={changePassword.isPending}
          disabled={!passwords.currentPassword || passwords.newPassword.length < 8}
          onClick={() => changePassword.mutate()}
        >
          Update password
        </Button>
      </Card>
    </div>
  );
}
