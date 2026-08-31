import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, MessageSquare, Sparkles } from "lucide-react";
import { Avatar, Badge } from "./ui";
import { cn, countdown, timeAgo } from "../lib/format";
import {
  CATEGORY_LABEL, CHANNEL_LABEL, PRIORITY_STYLE, SENTIMENT_STYLE, SLA_STYLE, STATUS_STYLE, TIER_STYLE,
} from "../lib/tokens";
import type { Sla, Ticket } from "../lib/types";

/**
 * Live SLA countdown. Recomputes from the deadline every second rather than
 * decrementing a stored value, so it stays correct across tab sleep and refetch.
 */
export function SlaTimer({ sla, compact }: { sla: Sla; compact?: boolean }) {
  const deadline =
    sla.nextDeadline === "FIRST_RESPONSE" ? sla.firstResponseDueAt : sla.resolutionDueAt;

  const [ms, setMs] = useState<number | null>(
    deadline ? new Date(deadline).getTime() - Date.now() : sla.msRemaining,
  );

  useEffect(() => {
    if (!deadline) {
      setMs(sla.msRemaining);
      return;
    }
    const tick = () => setMs(new Date(deadline).getTime() - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadline, sla.msRemaining]);

  if (sla.state === "MET") {
    return (
      <Badge className={SLA_STYLE.MET.chip}>
        SLA met
      </Badge>
    );
  }

  const { text, overdue } = countdown(ms);
  const style = SLA_STYLE[sla.state];

  if (compact) {
    return (
      <span className={cn("shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums", style.text)}>
        {text}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge className={style.chip} dot={overdue ? "bg-rose-500" : undefined}>
        {style.label}
      </Badge>
      <span className={cn("text-xs font-semibold tabular-nums", style.text)}>{text}</span>
    </div>
  );
}

/** Compact chip row shared by list and detail views. */
export function TicketMeta({ ticket, showChannel }: { ticket: Ticket; showChannel?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge className={PRIORITY_STYLE[ticket.priority].chip} dot={PRIORITY_STYLE[ticket.priority].dot}>
        {PRIORITY_STYLE[ticket.priority].label}
      </Badge>
      <Badge className={STATUS_STYLE[ticket.status].chip}>{STATUS_STYLE[ticket.status].label}</Badge>
      <Badge className="border-blush-200 bg-white text-ink-500">{CATEGORY_LABEL[ticket.category]}</Badge>
      <Badge className={SENTIMENT_STYLE[ticket.sentiment].chip}>
        <span aria-hidden>{SENTIMENT_STYLE[ticket.sentiment].emoji}</span>
        {SENTIMENT_STYLE[ticket.sentiment].label}
      </Badge>
      {showChannel && (
        <Badge className="border-cream-300 bg-cream-200 text-ink-500">{CHANNEL_LABEL[ticket.channel]}</Badge>
      )}
      {ticket.isEscalated && (
        <Badge className="border-rose-400/40 bg-rose-500/12 text-rose-600">
          <AlertTriangle className="h-3 w-3" /> Escalated
        </Badge>
      )}
    </div>
  );
}

export function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className="card card-hover block p-4 focus-visible:ring-2 focus-visible:ring-blush-400"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold text-ink-400">#{ticket.number}</span>
            <Badge className={TIER_STYLE[ticket.customer.tier].chip}>
              {TIER_STYLE[ticket.customer.tier].label}
            </Badge>
            {ticket.triagedByAi && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-400">
                <Sparkles className="h-3 w-3" /> AI
              </span>
            )}
          </div>

          <p className="truncate font-display text-[15px] font-600 leading-snug text-plum-800">
            {ticket.subject}
          </p>

          <p className="mt-1 truncate text-xs text-ink-400">
            {ticket.customer.name} · {timeAgo(ticket.createdAt)}
            {ticket._count ? ` · ${ticket._count.messages} messages` : ""}
          </p>

          {ticket.aiSummary && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-500">{ticket.aiSummary}</p>
          )}

          <div className="mt-3">
            <TicketMeta ticket={ticket} />
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {ticket.assignee ? (
            <Avatar name={ticket.assignee.name} hue={ticket.assignee.avatarHue} size="sm" />
          ) : (
            <span className="rounded-full border border-dashed border-blush-300 px-2 py-1 text-[10px] font-semibold text-ink-400">
              Unassigned
            </span>
          )}
          <SlaTimer sla={ticket.sla} compact />
          {ticket._count && ticket._count.drafts > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-400">
              <MessageSquare className="h-3 w-3" /> {ticket._count.drafts}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Dense single-line row used in the SLA monitor and escalation tables. */
export function TicketRowCompact({ ticket, right }: { ticket: Ticket; right?: React.ReactNode }) {
  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className="flex min-w-0 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition hover:border-blush-200 hover:bg-blush-50/60"
    >
      <span className={cn("h-8 w-1 shrink-0 rounded-full", PRIORITY_STYLE[ticket.priority].dot)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-plum-800">
          <span className="font-mono text-[11px] text-ink-400">#{ticket.number}</span> {ticket.subject}
        </p>
        <p className="truncate text-xs text-ink-400">
          {ticket.customer.name} · {CATEGORY_LABEL[ticket.category]} · {timeAgo(ticket.createdAt)}
        </p>
      </div>
      {right ?? <SlaTimer sla={ticket.sla} compact />}
    </Link>
  );
}
