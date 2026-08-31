import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, Hash, Send, ShieldCheck } from "lucide-react";
import { api, qs } from "../lib/api";
import { cn, dateTime, humanise, timeAgo } from "../lib/format";
import {
  Avatar, Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, Modal, SectionHeader,
} from "../components/ui";
import { SlaTimer } from "../components/TicketBits";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { ESCALATION_LABEL, PRIORITY_STYLE, TIER_STYLE, TRIGGER_LABEL } from "../lib/tokens";
import type { Escalation, SlackAlert, Ticket } from "../lib/types";

interface EscalationsData {
  escalations: (Escalation & { ticket: Ticket })[];
  summary: {
    open: number;
    acknowledged: number;
    resolved: number;
    byTrigger: { name: string; value: number }[];
  };
}

const TABS = [
  { key: "OPEN", label: "Open" },
  { key: "ACKNOWLEDGED", label: "Acknowledged" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "all", label: "All" },
];

export function EscalationsPage() {
  const toast = useToast();
  const { runtime } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("OPEN");
  const [payloadFor, setPayloadFor] = useState<SlackAlert | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["escalations", tab],
    queryFn: () => api.get<EscalationsData>(`/escalations${qs({ status: tab })}`),
    refetchInterval: 30_000,
  });

  const { data: alerts } = useQuery({
    queryKey: ["slack-alerts"],
    queryFn: () => api.get<{ alerts: SlackAlert[] }>("/escalations/slack/alerts").then((r) => r.alerts),
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["escalations"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const acknowledge = useMutation({
    mutationFn: (id: string) => api.post(`/escalations/${id}/acknowledge`),
    onSuccess: () => {
      invalidate();
      toast.success("Escalation acknowledged");
    },
    onError: (err: Error) => toast.error("Could not acknowledge", err.message),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => api.post(`/escalations/${id}/resolve`),
    onSuccess: () => {
      invalidate();
      toast.success("Escalation closed");
    },
    onError: (err: Error) => toast.error("Could not close", err.message),
  });

  const testSlack = useMutation({
    mutationFn: () => api.post<{ alert: SlackAlert }>("/escalations/slack/test", {}),
    onSuccess: ({ alert }) => {
      queryClient.invalidateQueries({ queryKey: ["slack-alerts"] });
      toast.success(
        alert.status === "SENT" ? "Alert posted to Slack" : "Alert simulated",
        alert.status === "SENT"
          ? `Delivered to ${alert.channel}`
          : "No webhook configured — captured in the outbox below.",
      );
    },
    onError: (err: Error) => toast.error("Slack test failed", err.message),
  });

  if (isLoading) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-600 text-plum-800">Escalations</h1>
          <p className="mt-1 text-sm text-ink-400">
            Raised by SLA breach, AI triage, or an agent — each one alerts Slack
          </p>
        </div>
        <Button
          variant="secondary"
          icon={<Send className="h-4 w-4" />}
          loading={testSlack.isPending}
          onClick={() => testSlack.mutate()}
        >
          Send test alert
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Open", value: data.summary.open, tone: "text-rose-600 bg-rose-500/12", icon: AlertTriangle },
          { label: "Acknowledged", value: data.summary.acknowledged, tone: "text-amber-700 bg-amber-50", icon: Check },
          { label: "Resolved", value: data.summary.resolved, tone: "text-emerald-700 bg-emerald-50", icon: CheckCircle2 },
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
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400">By trigger</p>
          <div className="mt-2 space-y-1">
            {data.summary.byTrigger.slice(0, 3).map((trigger) => (
              <div key={trigger.name} className="flex items-center justify-between text-xs">
                <span className="text-ink-500">{TRIGGER_LABEL[trigger.name] ?? trigger.name}</span>
                <span className="font-semibold tabular-nums text-plum-800">{trigger.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition",
              tab === item.key
                ? "border-transparent bg-plum-gradient text-white shadow-soft"
                : "border-blush-200 bg-white text-ink-600 hover:border-blush-300",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {data.escalations.length ? (
        <div className="space-y-3">
          {data.escalations.map((escalation) => (
            <Card key={escalation.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge
                      className={
                        escalation.level === "L3_SALON_DIRECTOR"
                          ? "border-rose-400/40 bg-rose-500/12 text-rose-600"
                          : escalation.level === "L2_SHIFT_MANAGER"
                            ? "border-gold-300 bg-gold-300/20 text-plum-700"
                            : "border-blush-200 bg-blush-50 text-plum-700"
                      }
                    >
                      <ShieldCheck className="h-3 w-3" />
                      {ESCALATION_LABEL[escalation.level]}
                    </Badge>
                    <Badge className="border-blush-200 bg-white text-ink-500">
                      {TRIGGER_LABEL[escalation.trigger] ?? escalation.trigger}
                    </Badge>
                    <Badge
                      className={
                        escalation.status === "OPEN"
                          ? "border-rose-400/40 bg-rose-500/12 text-rose-600"
                          : escalation.status === "ACKNOWLEDGED"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }
                    >
                      {humanise(escalation.status)}
                    </Badge>
                    {escalation.slackSent && (
                      <Badge className="border-blush-200 bg-white text-ink-500">
                        <Hash className="h-2.5 w-2.5" /> Slack alerted
                      </Badge>
                    )}
                  </div>

                  <Link to={`/tickets/${escalation.ticketId}`} className="group block">
                    <p className="font-display text-base font-600 text-plum-800 group-hover:text-rose-600">
                      <span className="font-mono text-xs text-ink-400">#{escalation.ticket.number}</span>{" "}
                      {escalation.ticket.subject}
                    </p>
                  </Link>

                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{escalation.reason}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-400">
                    <span className="flex items-center gap-1.5">
                      <Avatar name={escalation.ticket.customer.name} hue={300} size="xs" />
                      {escalation.ticket.customer.name}
                    </span>
                    <Badge className={TIER_STYLE[escalation.ticket.customer.tier].chip}>
                      {TIER_STYLE[escalation.ticket.customer.tier].label}
                    </Badge>
                    <Badge className={PRIORITY_STYLE[escalation.ticket.priority].chip}>
                      {PRIORITY_STYLE[escalation.ticket.priority].label}
                    </Badge>
                    <span>triggered {timeAgo(escalation.triggeredAt)}</span>
                    {escalation.acknowledgedBy && <span>· ack by {escalation.acknowledgedBy}</span>}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2.5">
                  <SlaTimer sla={escalation.ticket.sla} />
                  <div className="flex gap-2">
                    {escalation.status === "OPEN" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Check className="h-3.5 w-3.5" />}
                        loading={acknowledge.isPending}
                        onClick={() => acknowledge.mutate(escalation.id)}
                      >
                        Acknowledge
                      </Button>
                    )}
                    {escalation.status !== "RESOLVED" && (
                      <Button
                        size="sm"
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        loading={resolve.isPending}
                        onClick={() => resolve.mutate(escalation.id)}
                      >
                        Close
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" />}
          title={tab === "OPEN" ? "No open escalations" : "Nothing here"}
          description="Escalations appear automatically when an SLA breaches or AI triage flags a ticket."
        />
      )}

      {/* Slack outbox */}
      <Card className="p-5">
        <SectionHeader
          title="Slack outbox"
          subtitle={
            runtime?.slackConfigured
              ? `Live — posting to ${runtime.slackChannel}`
              : `Simulated — set SLACK_WEBHOOK_URL to post to ${runtime?.slackChannel ?? "#luxenails-support"} for real`
          }
          icon={<Hash className="h-4.5 w-4.5" />}
        />
        {alerts?.length ? (
          <div className="space-y-2.5">
            {alerts.slice(0, 12).map((alert) => (
              <button
                key={alert.id}
                onClick={() => setPayloadFor(alert)}
                className="w-full rounded-xl border border-blush-100 bg-cream-50 px-4 py-3 text-left transition hover:border-blush-300 hover:bg-blush-50/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-plum-800">{alert.title}</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-ink-400">{alert.channel}</span>
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
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-500">
                  {alert.text.replace(/\*/g, "")}
                </p>
                <p className="mt-1.5 text-[10px] uppercase tracking-wide text-ink-400">
                  {dateTime(alert.createdAt)} · click to inspect the Block Kit payload
                </p>
                {alert.error && <p className="mt-1 text-xs text-rose-600">{alert.error}</p>}
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Hash className="h-5 w-5" />} title="No alerts raised yet" />
        )}
      </Card>

      <Modal
        open={!!payloadFor}
        onClose={() => setPayloadFor(null)}
        title="Slack payload"
        description={`Exactly what is POSTed to the webhook · ${payloadFor?.status.toLowerCase()}`}
        width="max-w-2xl"
        footer={<Button variant="secondary" onClick={() => setPayloadFor(null)}>Close</Button>}
      >
        <pre className="overflow-x-auto rounded-xl bg-plum-900 p-4 font-mono text-[11px] leading-relaxed text-blush-200">
          {JSON.stringify(payloadFor?.payload ?? {}, null, 2)}
        </pre>
      </Modal>
    </div>
  );
}
