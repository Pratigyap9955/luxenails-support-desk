import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, ChevronRight, Play, Sparkles, Wand2, X, Zap } from "lucide-react";
import { api } from "../lib/api";
import { cn, timeAgo } from "../lib/format";
import {
  Badge, Button, Card, ConfidenceMeter, EmptyState, ErrorState, LoadingBlock, SectionHeader, Select, Textarea, Input,
} from "../components/ui";
import { TicketRowCompact } from "../components/TicketBits";
import { useToast } from "../context/ToastContext";
import {
  CATEGORY_LABEL, PRIORITY_STYLE, SENTIMENT_STYLE, TIER_STYLE,
} from "../lib/tokens";
import type { Citation, ReplyDraft, Ticket, Tier, TriageResult } from "../lib/types";

interface TriageQueue {
  untriaged: (Ticket & { messages: { body: string }[] })[];
  recentlyTriaged: Ticket[];
  lowConfidence: Ticket[];
  pendingDrafts: (ReplyDraft & { ticket: Ticket })[];
  stats: {
    untriagedCount: number;
    triagedTotal: number;
    avgConfidence: number;
    pendingDrafts: number;
    engine: string;
    model: string;
  };
}

const SAMPLES = [
  {
    label: "Angry complaint",
    subject: "My nails were ruined and nobody has called me back",
    body: "I paid £75 for an acrylic set on Saturday and two nails snapped off by Monday. I called yesterday and nobody has called me back. This is the second time this has happened and frankly it's unacceptable for the money I spend with you. I want a refund.",
  },
  {
    label: "Safety issue",
    subject: "Swollen and weeping cuticle after my appointment",
    body: "The skin around my index finger has been swollen and weeping since my appointment on Thursday. It's quite painful and looks infected. I need to know what to do and what was used on me.",
  },
  {
    label: "Simple booking",
    subject: "Availability next Tuesday?",
    body: "Hi, do you have any availability for a gel manicure next Tuesday afternoon? Happy with any technician. Thanks!",
  },
  {
    label: "Happy feedback",
    subject: "Absolutely obsessed with my nails",
    body: "I just wanted to say thank you — Sofia did the most beautiful chrome set yesterday and I've had compliments all day. Genuinely the best salon in London. See you in three weeks!",
  },
];

export function TriagePage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["triage-queue"],
    queryFn: () => api.get<TriageQueue>("/triage/queue"),
    refetchInterval: 30_000,
  });

  const batch = useMutation({
    mutationFn: () => api.post<{ processed: number; succeeded: number; failed: number }>("/triage/batch"),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["triage-queue"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      toast.success(
        `Triaged ${result.succeeded} ${result.succeeded === 1 ? "ticket" : "tickets"}`,
        result.failed ? `${result.failed} could not be processed` : "SLA clocks are now running",
      );
    },
    onError: (err: Error) => toast.error("Batch triage failed", err.message),
  });

  if (isLoading) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-600 text-plum-800">AI Triage</h1>
          <p className="mt-1 text-sm text-ink-400">
            Classification, retrieval and reply drafting · engine:{" "}
            <span className="font-semibold text-plum-700">{data.stats.engine}</span>{" "}
            <span className="font-mono text-xs">({data.stats.model})</span>
          </p>
        </div>
        {data.stats.untriagedCount > 0 && (
          <Button
            icon={<Zap className="h-4 w-4" />}
            loading={batch.isPending}
            onClick={() => batch.mutate()}
          >
            Triage all {data.stats.untriagedCount}
          </Button>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Awaiting triage", value: data.stats.untriagedCount },
          { label: "Triaged total", value: data.stats.triagedTotal },
          { label: "Avg confidence", value: `${Math.round(data.stats.avgConfidence * 100)}%` },
          { label: "Drafts to approve", value: data.stats.pendingDrafts },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-400">{stat.label}</p>
            <p className="mt-2 font-display text-2xl font-600 text-plum-800 tabular-nums">{stat.value}</p>
          </Card>
        ))}
      </div>

      <TriagePlayground />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Untriaged */}
        <Card className="p-5">
          <SectionHeader
            title="Awaiting triage"
            subtitle="No category, priority or SLA clock yet"
            icon={<Sparkles className="h-4.5 w-4.5" />}
          />
          {data.untriaged.length ? (
            <div className="space-y-2.5">
              {data.untriaged.map((ticket) => (
                <UntriagedRow key={ticket.id} ticket={ticket} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Check className="h-5 w-5" />} title="Everything is triaged" />
          )}
        </Card>

        {/* Approval queue */}
        <Card className="p-5">
          <SectionHeader
            title="Drafts awaiting approval"
            subtitle="Written by AI, sent only after an agent approves"
            icon={<Wand2 className="h-4.5 w-4.5" />}
          />
          {data.pendingDrafts.length ? (
            <div className="space-y-2.5">
              {data.pendingDrafts.map((draft) => (
                <Link
                  key={draft.id}
                  to={`/tickets/${draft.ticketId}`}
                  className="block rounded-xl border border-blush-100 bg-cream-50 p-3.5 transition hover:border-blush-300 hover:bg-blush-50/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-plum-800">
                        <span className="font-mono text-[11px] text-ink-400">#{draft.ticket.number}</span>{" "}
                        {draft.ticket.subject}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{draft.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <ConfidenceMeter value={draft.confidence} />
                        <Badge className="border-blush-200 bg-white text-ink-500">
                          <BookOpen className="h-2.5 w-2.5" /> {draft.citations.length} sources
                        </Badge>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-400" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Check className="h-5 w-5" />} title="Nothing waiting on you" />
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeader title="Recently triaged" subtitle="Latest AI classifications" />
          <div className="-mx-1 space-y-0.5">
            {data.recentlyTriaged.map((ticket) => (
              <TicketRowCompact
                key={ticket.id}
                ticket={ticket}
                right={
                  ticket.aiConfidence !== null ? (
                    <span className="shrink-0 font-mono text-xs text-ink-400">
                      {Math.round(ticket.aiConfidence * 100)}%
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader
            title="Low confidence"
            subtitle="Under 60% — worth a human second opinion"
          />
          {data.lowConfidence.length ? (
            <div className="-mx-1 space-y-0.5">
              {data.lowConfidence.map((ticket) => (
                <TicketRowCompact
                  key={ticket.id}
                  ticket={ticket}
                  right={
                    <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                      {Math.round((ticket.aiConfidence ?? 0) * 100)}%
                    </Badge>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Check className="h-5 w-5" />} title="All classifications are confident" />
          )}
        </Card>
      </div>
    </div>
  );
}

function UntriagedRow({ ticket }: { ticket: Ticket & { messages: { body: string }[] } }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const triage = useMutation({
    mutationFn: () => api.post<{ ticket: Ticket }>(`/tickets/${ticket.id}/triage`),
    onSuccess: ({ ticket: result }) => {
      queryClient.invalidateQueries({ queryKey: ["triage-queue"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      toast.success(
        `#${result.number} triaged`,
        `${CATEGORY_LABEL[result.category]} · ${result.priority.toLowerCase()} · ${result.sentiment.toLowerCase()}`,
      );
    },
    onError: (err: Error) => toast.error("Triage failed", err.message),
  });

  return (
    <div className="rounded-xl border border-blush-100 bg-cream-50 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link to={`/tickets/${ticket.id}`} className="block">
            <p className="truncate text-sm font-semibold text-plum-800">
              <span className="font-mono text-[11px] text-ink-400">#{ticket.number}</span> {ticket.subject}
            </p>
          </Link>
          <p className="mt-0.5 text-xs text-ink-400">
            {ticket.customer.name} · {timeAgo(ticket.createdAt)}
          </p>
          {ticket.messages?.[0] && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-500">
              {ticket.messages[0].body}
            </p>
          )}
        </div>
        <Button
          size="sm"
          icon={<Sparkles className="h-3.5 w-3.5" />}
          loading={triage.isPending}
          onClick={() => triage.mutate()}
        >
          Triage
        </Button>
      </div>
    </div>
  );
}

/** Classify arbitrary text and see the retrieval, without creating a ticket. */
function TriagePlayground() {
  const [subject, setSubject] = useState(SAMPLES[0].subject);
  const [body, setBody] = useState(SAMPLES[0].body);
  const [tier, setTier] = useState<Tier>("GOLD");
  const [result, setResult] = useState<{ triage: TriageResult; citations: Citation[]; tookMs: number } | null>(null);

  const run = useMutation({
    mutationFn: () =>
      api.post<{ triage: TriageResult; citations: Citation[]; tookMs: number }>("/triage/preview", {
        subject,
        body,
        customerTier: tier,
      }),
    onSuccess: setResult,
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blush-100 bg-blush-50/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-rose-400" />
          <p className="font-display text-sm font-600 text-plum-800">Try the triage engine</p>
        </div>
        <p className="text-xs text-ink-400">Classifies and retrieves without creating a ticket</p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
            {SAMPLES.map((sample) => (
              <button
                key={sample.label}
                onClick={() => {
                  setSubject(sample.subject);
                  setBody(sample.body);
                  setResult(null);
                }}
                className="shrink-0 rounded-full border border-blush-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:border-blush-300 hover:text-plum-700"
              >
                {sample.label}
              </button>
            ))}
          </div>

          <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea label="Message" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />

          <div className="flex items-end gap-3">
            <Select label="Customer tier" value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
              {(Object.keys(TIER_STYLE) as Tier[]).map((t) => (
                <option key={t} value={t}>{TIER_STYLE[t].label}</option>
              ))}
            </Select>
            <Button
              loading={run.isPending}
              icon={<Sparkles className="h-4 w-4" />}
              onClick={() => run.mutate()}
              disabled={!subject.trim() || body.trim().length < 5}
            >
              Analyse
            </Button>
          </div>
        </div>

        <div>
          {result ? (
            <div className="space-y-4 rounded-xl border border-blush-100 bg-cream-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={PRIORITY_STYLE[result.triage.priority].chip} dot={PRIORITY_STYLE[result.triage.priority].dot}>
                  {PRIORITY_STYLE[result.triage.priority].label}
                </Badge>
                <Badge className="border-blush-200 bg-white text-plum-700">
                  {CATEGORY_LABEL[result.triage.category]}
                </Badge>
                <Badge className={SENTIMENT_STYLE[result.triage.sentiment].chip}>
                  {SENTIMENT_STYLE[result.triage.sentiment].emoji} {SENTIMENT_STYLE[result.triage.sentiment].label}
                </Badge>
                {result.triage.escalationRecommended && (
                  <Badge className="border-rose-400/40 bg-rose-500/12 text-rose-600">Escalate</Badge>
                )}
              </div>

              <ConfidenceMeter value={result.triage.confidence} />

              <div>
                <p className="label">Summary</p>
                <p className="text-sm leading-relaxed text-ink-600">{result.triage.summary}</p>
              </div>
              <div>
                <p className="label">Intent</p>
                <p className="text-sm text-ink-600">{result.triage.intent}</p>
              </div>
              <div>
                <p className="label">Reasoning</p>
                <p className="text-xs leading-relaxed text-ink-500">{result.triage.reasoning}</p>
              </div>

              <div>
                <p className="label">Retrieved knowledge ({result.citations.length})</p>
                <div className="space-y-1.5">
                  {result.citations.map((c) => (
                    <div key={c.chunkId} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                      <span className="truncate text-xs font-medium text-plum-700">{c.title}</span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-400">{c.score.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="border-t border-blush-100 pt-3 font-mono text-[10px] text-ink-400">
                {result.triage.engine} · {result.triage.model} · {result.tookMs}ms
              </p>
            </div>
          ) : (
            <div className={cn(
              "flex h-full min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-blush-200 px-6 text-center",
            )}>
              {run.isError ? (
                <>
                  <X className="mb-2 h-5 w-5 text-rose-500" />
                  <p className="text-sm text-rose-600">{(run.error as Error).message}</p>
                </>
              ) : (
                <>
                  <Sparkles className="mb-2 h-5 w-5 text-rose-300" />
                  <p className="text-sm text-ink-400">
                    Pick a sample or write your own, then hit Analyse to see the classification and the
                    knowledge base passages it would retrieve.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
