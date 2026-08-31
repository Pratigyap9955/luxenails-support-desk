import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, Clock, RefreshCw, Timer, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import { cn, duration } from "../lib/format";
import {
  Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, ProgressBar, SectionHeader,
} from "../components/ui";
import { SlaTimer, TicketRowCompact } from "../components/TicketBits";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { PRIORITY_STYLE } from "../lib/tokens";
import type { SlaPolicy, Ticket } from "../lib/types";

interface MonitorData {
  buckets: { breached: Ticket[]; atRisk: Ticket[]; onTrack: Ticket[] };
  summary: {
    total: number;
    breached: number;
    atRisk: number;
    onTrack: number;
    complianceRate: number;
    measured: number;
  };
}

export function SlaMonitorPage() {
  const toast = useToast();
  const { runtime } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sla-monitor"],
    queryFn: () => api.get<MonitorData>("/sla/monitor"),
    refetchInterval: 20_000,
  });

  const { data: policies } = useQuery({
    queryKey: ["sla-policies"],
    queryFn: () => api.get<{ policies: SlaPolicy[] }>("/sla/policies").then((r) => r.policies),
  });

  const scan = useMutation({
    mutationFn: () =>
      api.post<{ result: { scanned: number; warned: number; breached: number; escalated: number } }>("/sla/scan"),
    onSuccess: ({ result }) => {
      queryClient.invalidateQueries({ queryKey: ["sla-monitor"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["escalations"] });
      toast.success(
        `Scanned ${result.scanned} open tickets`,
        `${result.warned} warned · ${result.breached} breached · ${result.escalated} escalated`,
      );
    },
    onError: (err: Error) => toast.error("Scan failed", err.message),
  });

  if (isLoading) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={refetch} />;
  if (!data) return null;

  const { buckets, summary } = data;

  const columns = [
    {
      key: "breached",
      title: "Breached",
      tickets: buckets.breached,
      accent: "border-rose-400/40",
      header: "bg-rose-500/10 text-rose-600",
      empty: "Nothing has breached",
    },
    {
      key: "atRisk",
      title: "At risk",
      tickets: buckets.atRisk,
      accent: "border-amber-200",
      header: "bg-amber-50 text-amber-700",
      empty: "Nothing approaching a deadline",
    },
    {
      key: "onTrack",
      title: "On track",
      tickets: buckets.onTrack,
      accent: "border-emerald-200",
      header: "bg-emerald-50 text-emerald-700",
      empty: "No open tickets",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-600 text-plum-800">SLA Monitor</h1>
          <p className="mt-1 text-sm text-ink-400">
            Background scan runs every {runtime?.slaScanIntervalSeconds ?? 60}s · warns at{" "}
            {Math.round((runtime?.slaWarningThreshold ?? 0.75) * 100)}% elapsed
          </p>
        </div>
        <Button
          variant="secondary"
          icon={<RefreshCw className={cn("h-4 w-4", scan.isPending && "animate-spin")} />}
          loading={scan.isPending}
          onClick={() => scan.mutate()}
        >
          Run scan now
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400">Compliance</p>
          <p className="mt-2 font-display text-3xl font-600 text-plum-800 tabular-nums">
            {summary.complianceRate}%
          </p>
          <ProgressBar
            value={summary.complianceRate}
            className="mt-3"
            barClassName={summary.complianceRate >= 90 ? "bg-emerald-500" : summary.complianceRate >= 75 ? "bg-gold-400" : "bg-rose-500"}
          />
          <p className="mt-2 text-xs text-ink-400">across {summary.measured} measured tickets</p>
        </Card>

        {[
          { label: "Breached", value: summary.breached, icon: Timer, tone: "text-rose-600 bg-rose-500/12" },
          { label: "At risk", value: summary.atRisk, icon: Clock, tone: "text-amber-700 bg-amber-50" },
          { label: "On track", value: summary.onTrack, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400">{stat.label}</p>
                <p className="mt-2 font-display text-3xl font-600 text-plum-800 tabular-nums">{stat.value}</p>
              </div>
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", stat.tone)}>
                <stat.icon className="h-4.5 w-4.5" />
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Board */}
      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map((column) => (
          <Card key={column.key} className={cn("overflow-hidden", column.accent)}>
            <div className={cn("flex items-center justify-between px-5 py-3", column.header)}>
              <p className="font-display text-sm font-600">{column.title}</p>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold tabular-nums">
                {column.tickets.length}
              </span>
            </div>
            <div className="max-h-[32rem] space-y-2 overflow-y-auto p-3">
              {column.tickets.length ? (
                column.tickets.map((ticket) => (
                  <div key={ticket.id} className="rounded-xl border border-blush-100 bg-white p-3">
                    <TicketRowCompact ticket={ticket} right={<SlaTimer sla={ticket.sla} compact />} />
                    <div className="mt-2 px-3">
                      <ProgressBar
                        value={Math.min(100, ticket.sla.elapsedRatio * 100)}
                        barClassName={
                          ticket.sla.state === "BREACHED"
                            ? "bg-rose-500"
                            : ticket.sla.state === "AT_RISK"
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        }
                      />
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wide text-ink-400">
                          {ticket.sla.nextDeadline === "FIRST_RESPONSE" ? "First response" : "Resolution"}
                        </span>
                        <Badge className={PRIORITY_STYLE[ticket.priority].chip}>
                          {PRIORITY_STYLE[ticket.priority].label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-4 py-8 text-center text-sm text-ink-400">{column.empty}</p>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Policies */}
      <Card className="p-5">
        <SectionHeader
          title="SLA policies"
          subtitle="Targets are applied when a ticket is triaged or re-prioritised"
          icon={<TrendingUp className="h-4.5 w-4.5" />}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="border-b border-blush-100 text-left">
                <th className="pb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Priority</th>
                <th className="pb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Policy</th>
                <th className="pb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400">First response</th>
                <th className="pb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Resolution</th>
                <th className="pb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Auto-escalate</th>
              </tr>
            </thead>
            <tbody>
              {policies?.map((policy) => (
                <tr key={policy.id} className="border-b border-blush-50 last:border-0">
                  <td className="py-3">
                    <Badge className={PRIORITY_STYLE[policy.priority].chip} dot={PRIORITY_STYLE[policy.priority].dot}>
                      {PRIORITY_STYLE[policy.priority].label}
                    </Badge>
                  </td>
                  <td className="py-3 text-ink-600">{policy.name}</td>
                  <td className="py-3 font-semibold tabular-nums text-plum-800">
                    {duration(policy.firstResponseMins)}
                  </td>
                  <td className="py-3 font-semibold tabular-nums text-plum-800">
                    {duration(policy.resolutionMins)}
                  </td>
                  <td className="py-3 text-ink-500">{duration(policy.escalateAfterMins)} past due</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {summary.total === 0 && (
        <EmptyState
          icon={<Activity className="h-5 w-5" />}
          title="No open tickets"
          description="Every ticket is resolved — nothing on the clock."
        />
      )}
    </div>
  );
}
