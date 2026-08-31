import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock, Hash, Inbox, Sparkles, Timer, TrendingUp, Users,
} from "lucide-react";
import { api } from "../lib/api";
import { cn, duration, timeAgo } from "../lib/format";
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, SectionHeader } from "../components/ui";
import { TicketRowCompact } from "../components/TicketBits";
import { useAuth } from "../context/AuthContext";
import type { Overview, SlackAlert, Ticket, TicketEvent } from "../lib/types";

interface DashboardData {
  overview: Overview;
  needsAttention: Ticket[];
  recent: Ticket[];
  activity: TicketEvent[];
  alerts: SlackAlert[];
}

function StatCard({
  label, value, sub, icon: Icon, tone = "default", to,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Inbox;
  tone?: "default" | "warn" | "danger" | "good";
  to?: string;
}) {
  const tones = {
    default: "text-plum-700 bg-blush-100",
    warn: "text-amber-700 bg-amber-50",
    danger: "text-rose-600 bg-rose-500/12",
    good: "text-emerald-700 bg-emerald-50",
  };

  const content = (
    <Card hover={!!to} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400">{label}</p>
          <p className="mt-2 font-display text-3xl font-600 leading-none text-plum-800 tabular-nums">
            {value}
          </p>
          {sub && <p className="mt-2 truncate text-xs text-ink-400">{sub}</p>}
        </div>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
    </Card>
  );

  return to ? <Link to={to}>{content}</Link> : content;
}

const EVENT_ICON: Record<string, typeof Activity> = {
  CREATED: Inbox,
  TRIAGED: Sparkles,
  DRAFT_GENERATED: Sparkles,
  DRAFT_APPROVED: CheckCircle2,
  DRAFT_EDITED: CheckCircle2,
  ESCALATED: AlertTriangle,
  SLA_WARNING: Timer,
  SLA_BREACH: Timer,
  RESOLVED: CheckCircle2,
};

export function DashboardPage() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardData>("/analytics/dashboard"),
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={refetch} />;
  if (!data) return null;

  const { overview, needsAttention, recent, activity, alerts } = data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl bg-plum-gradient px-6 py-7 shadow-lift sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blush-300">
              {greeting}, {user?.name.split(" ")[0]}
            </p>
            <h1 className="mt-2 font-display text-2xl font-600 text-white sm:text-3xl">
              {overview.openTickets} open {overview.openTickets === 1 ? "ticket" : "tickets"} on the desk
            </h1>
            <p className="mt-2 max-w-xl text-sm text-blush-300/85">
              {overview.breached > 0
                ? `${overview.breached} past SLA and ${overview.atRisk} approaching the deadline.`
                : overview.atRisk > 0
                  ? `Nothing breached — ${overview.atRisk} approaching the deadline.`
                  : "Every ticket is inside its SLA window."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {overview.pendingDrafts > 0 && (
              <Link
                to="/triage"
                className="inline-flex items-center gap-2 rounded-xl bg-white/12 px-3.5 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                <Sparkles className="h-4 w-4" /> {overview.pendingDrafts} drafts to review
              </Link>
            )}
            {overview.escalationsOpen > 0 && (
              <Link
                to="/escalations"
                className="inline-flex items-center gap-2 rounded-xl bg-rose-500/90 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
              >
                <AlertTriangle className="h-4 w-4" /> {overview.escalationsOpen} escalations
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open tickets" value={overview.openTickets} sub={`${overview.newToday} opened today`} icon={Inbox} to="/tickets" />
        <StatCard
          label="SLA breached"
          value={overview.breached}
          sub={`${overview.atRisk} at risk`}
          icon={Timer}
          tone={overview.breached > 0 ? "danger" : "good"}
          to="/sla"
        />
        <StatCard
          label="Awaiting approval"
          value={overview.pendingDrafts}
          sub="AI drafts ready to send"
          icon={Sparkles}
          tone={overview.pendingDrafts > 0 ? "warn" : "default"}
          to="/triage"
        />
        <StatCard
          label="SLA compliance"
          value={`${overview.slaComplianceRate}%`}
          sub={`First response ${duration(overview.avgFirstResponseMins)}`}
          icon={TrendingUp}
          tone={overview.slaComplianceRate >= 90 ? "good" : "warn"}
          to="/analytics"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Unassigned" value={overview.unassigned} icon={Users} sub="Need an owner" to="/tickets" />
        <StatCard label="Urgent" value={overview.urgent} icon={AlertTriangle} tone={overview.urgent ? "danger" : "default"} sub="Highest priority" to="/tickets" />
        <StatCard label="Resolved today" value={overview.resolvedToday} icon={CheckCircle2} tone="good" sub={`Avg ${duration(overview.avgResolutionMins)}`} />
        <StatCard
          label="AI confidence"
          value={`${Math.round(overview.avgAiConfidence * 100)}%`}
          icon={Sparkles}
          sub={`${overview.aiTriageRate}% auto-triaged`}
          to="/triage"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Needs attention */}
        <Card className="p-5 lg:col-span-2">
          <SectionHeader
            title="Needs attention"
            subtitle="Urgent, high priority, or running out of SLA runway"
            icon={<AlertTriangle className="h-4.5 w-4.5" />}
            action={
              <Link to="/tickets" className="inline-flex items-center gap-1 text-sm font-semibold text-rose-500 hover:text-rose-600">
                All tickets <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {needsAttention.length ? (
            <div className="-mx-1 space-y-0.5">
              {needsAttention.map((ticket) => (
                <TicketRowCompact key={ticket.id} ticket={ticket} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Nothing needs chasing"
              description="No urgent tickets and no SLA risk right now."
            />
          )}
        </Card>

        {/* Activity */}
        <Card className="p-5">
          <SectionHeader title="Live activity" icon={<Activity className="h-4.5 w-4.5" />} />
          <div className="space-y-3">
            {activity.slice(0, 8).map((event) => {
              const Icon = EVENT_ICON[event.type] ?? Hash;
              return (
                <div key={event.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blush-100 text-rose-400">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed text-ink-600">
                      {event.ticket && (
                        <Link to={`/tickets`} className="font-mono font-semibold text-plum-700">
                          #{event.ticket.number}{" "}
                        </Link>
                      )}
                      {event.message}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-400">
                      {event.actorName} · {timeAgo(event.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Recent */}
        <Card className="p-5 lg:col-span-2">
          <SectionHeader title="Latest tickets" icon={<Clock className="h-4.5 w-4.5" />} />
          <div className="-mx-1 space-y-0.5">
            {recent.map((ticket) => (
              <TicketRowCompact key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </Card>

        {/* Slack outbox */}
        <Card className="p-5">
          <SectionHeader
            title="Slack alerts"
            icon={<Hash className="h-4.5 w-4.5" />}
            action={
              <Link to="/escalations" className="text-sm font-semibold text-rose-500 hover:text-rose-600">
                View all
              </Link>
            }
          />
          {alerts.length ? (
            <div className="space-y-2.5">
              {alerts.map((alert) => (
                <div key={alert.id} className="rounded-xl border border-blush-100 bg-cream-50 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-plum-800">{alert.title}</p>
                    <Badge
                      className={
                        alert.status === "SENT"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : alert.status === "FAILED"
                            ? "border-rose-400/40 bg-rose-500/12 text-rose-600"
                            : "border-gold-300 bg-gold-300/20 text-plum-700"
                      }
                    >
                      {alert.status}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-500">
                    {alert.text.replace(/\*/g, "")}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-ink-400">
                    {alert.channel} · {timeAgo(alert.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Hash className="h-5 w-5" />} title="No alerts yet" />
          )}
        </Card>
      </div>
    </div>
  );
}
