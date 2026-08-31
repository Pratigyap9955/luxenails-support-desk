import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, BookOpen, Check, CheckCircle2, ChevronDown, Clock, Lock,
  MessageSquare, Pencil, Send, Sparkles, Timer, Trash2, User as UserIcon,
} from "lucide-react";
import { api } from "../lib/api";
import { cn, dateTime, humanise, money, timeAgo } from "../lib/format";
import {
  Avatar, Badge, Button, Card, ConfidenceMeter, EmptyState, ErrorState, LoadingBlock, Modal,
  SectionHeader, Select, Textarea,
} from "../components/ui";
import { SlaTimer, TicketMeta } from "../components/TicketBits";
import { useToast } from "../context/ToastContext";
import { CATEGORY_LABEL, CHANNEL_LABEL, ESCALATION_LABEL, SLA_STYLE, TIER_STYLE } from "../lib/tokens";
import type { Category, Priority, ReplyDraft, Ticket, TicketStatus, User } from "../lib/types";

const STATUSES: TicketStatus[] = ["NEW", "TRIAGED", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"];
const PRIORITIES: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");

  const ticketKey = ["ticket", id];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ticketKey,
    queryFn: () => api.get<{ ticket: Ticket }>(`/tickets/${id}`).then((r) => r.ticket),
    enabled: !!id,
    refetchInterval: 45_000,
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ users: User[] }>("/auth/users").then((r) => r.users),
    staleTime: 300_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ticketKey });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["tickets"] });
  };

  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(`/tickets/${id}`, patch),
    onSuccess: () => {
      refresh();
      toast.success("Ticket updated");
    },
    onError: (err: Error) => toast.error("Update failed", err.message),
  });

  const retriage = useMutation({
    mutationFn: () => api.post<{ ticket: Ticket }>(`/tickets/${id}/triage`),
    onSuccess: ({ ticket }) => {
      refresh();
      toast.success(
        "AI triage complete",
        `${CATEGORY_LABEL[ticket.category]} · ${ticket.priority.toLowerCase()} · ${ticket.sentiment.toLowerCase()}`,
      );
    },
    onError: (err: Error) => toast.error("Triage failed", err.message),
  });

  const generateDraft = useMutation({
    mutationFn: () => api.post<{ draft: ReplyDraft; citations: unknown[]; engine: string }>(`/tickets/${id}/draft`),
    onSuccess: (result) => {
      refresh();
      toast.success(
        "Draft ready for review",
        `Grounded in ${result.citations.length} knowledge base passages`,
      );
    },
    onError: (err: Error) => toast.error("Could not generate a draft", err.message),
  });

  const sendMessage = useMutation({
    mutationFn: () => api.post(`/tickets/${id}/messages`, { body: reply, isInternal }),
    onSuccess: () => {
      setReply("");
      refresh();
      toast.success(isInternal ? "Internal note added" : "Reply sent");
    },
    onError: (err: Error) => toast.error("Could not send", err.message),
  });

  const escalate = useMutation({
    mutationFn: () => api.post(`/tickets/${id}/escalate`, { reason: escalateReason }),
    onSuccess: () => {
      setEscalateOpen(false);
      setEscalateReason("");
      refresh();
      queryClient.invalidateQueries({ queryKey: ["escalations"] });
      toast.success("Escalated", "A Slack alert has been raised.");
    },
    onError: (err: Error) => toast.error("Escalation failed", err.message),
  });

  const resolve = useMutation({
    mutationFn: () => api.post(`/tickets/${id}/resolve`, {}),
    onSuccess: () => {
      refresh();
      toast.success("Ticket resolved");
    },
    onError: (err: Error) => toast.error("Could not resolve", err.message),
  });

  if (isLoading) return <LoadingBlock rows={6} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={refetch} />;
  if (!data) return null;

  const ticket = data;
  const pendingDraft = ticket.drafts?.find((d) => d.status === "PENDING");
  const isClosed = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 transition hover:text-plum-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-ink-400">#{ticket.number}</span>
              <Badge className="border-cream-300 bg-cream-200 text-ink-500">
                {CHANNEL_LABEL[ticket.channel]}
              </Badge>
              <span className="text-xs text-ink-400">opened {timeAgo(ticket.createdAt)}</span>
            </div>
            <h1 className="font-display text-xl font-600 leading-snug text-plum-800 sm:text-2xl">
              {ticket.subject}
            </h1>
            <div className="mt-3">
              <TicketMeta ticket={ticket} />
            </div>
          </div>

          <div className="flex flex-col items-end gap-2.5">
            <SlaTimer sla={ticket.sla} />
            <div className="flex flex-wrap justify-end gap-2">
              {!isClosed && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Sparkles className="h-3.5 w-3.5" />}
                    loading={retriage.isPending}
                    onClick={() => retriage.mutate()}
                  >
                    Re-run triage
                  </Button>
                  {!ticket.isEscalated && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<AlertTriangle className="h-3.5 w-3.5" />}
                      onClick={() => setEscalateOpen(true)}
                    >
                      Escalate
                    </Button>
                  )}
                  <Button
                    size="sm"
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    loading={resolve.isPending}
                    onClick={() => resolve.mutate()}
                  >
                    Resolve
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Conversation + composer */}
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <SectionHeader
              title="Conversation"
              subtitle={`${ticket.messages?.length ?? 0} messages`}
              icon={<MessageSquare className="h-4.5 w-4.5" />}
            />
            <div className="space-y-4">
              {ticket.messages?.map((message) => {
                const isCustomer = message.authorType === "CUSTOMER";
                return (
                  <div key={message.id} className={cn("flex gap-3", !isCustomer && "flex-row-reverse")}>
                    <Avatar
                      name={message.authorName}
                      hue={isCustomer ? 20 : 330}
                      size="sm"
                      className="mt-1"
                    />
                    <div className={cn("min-w-0 max-w-[85%]", !isCustomer && "text-right")}>
                      <div className={cn("mb-1 flex items-center gap-2", !isCustomer && "justify-end")}>
                        <span className="text-xs font-semibold text-plum-800">{message.authorName}</span>
                        {message.isInternal && (
                          <Badge className="border-gold-300 bg-gold-300/20 text-plum-700">
                            <Lock className="h-2.5 w-2.5" /> Internal
                          </Badge>
                        )}
                        <span className="text-[10px] text-ink-400">{dateTime(message.createdAt)}</span>
                      </div>
                      <div
                        className={cn(
                          "whitespace-pre-wrap rounded-2xl px-4 py-3 text-left text-sm leading-relaxed",
                          message.isInternal
                            ? "border border-gold-300/60 bg-gold-300/12 text-ink-700"
                            : isCustomer
                              ? "border border-blush-100 bg-cream-50 text-ink-700"
                              : "bg-plum-gradient text-white",
                        )}
                      >
                        {message.body}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* AI draft awaiting approval */}
          {pendingDraft ? (
            <DraftReviewCard draft={pendingDraft} onDone={refresh} />
          ) : (
            !isClosed && (
              <Card className="border-dashed p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blush-100 text-rose-400">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-display text-sm font-600 text-plum-800">Draft a reply with AI</p>
                      <p className="mt-0.5 text-xs text-ink-400">
                        Searches the knowledge base, then writes a grounded reply for you to approve.
                      </p>
                    </div>
                  </div>
                  <Button
                    loading={generateDraft.isPending}
                    icon={<Sparkles className="h-4 w-4" />}
                    onClick={() => generateDraft.mutate()}
                  >
                    Generate draft
                  </Button>
                </div>
              </Card>
            )
          )}

          {/* Manual composer */}
          {!isClosed && (
            <Card className="p-5">
              <SectionHeader title="Reply" icon={<Send className="h-4.5 w-4.5" />} />
              <Textarea
                rows={5}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={isInternal ? "Add a note only the team can see…" : "Write your reply to the customer…"}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="h-4 w-4 accent-rose-500"
                  />
                  Internal note
                </label>
                <Button
                  disabled={!reply.trim()}
                  loading={sendMessage.isPending}
                  icon={<Send className="h-4 w-4" />}
                  onClick={() => sendMessage.mutate()}
                >
                  {isInternal ? "Add note" : "Send reply"}
                </Button>
              </div>
            </Card>
          )}

          {/* Draft history */}
          {ticket.drafts && ticket.drafts.filter((d) => d.status !== "PENDING").length > 0 && (
            <Card className="p-5">
              <SectionHeader title="AI draft history" icon={<Sparkles className="h-4.5 w-4.5" />} />
              <div className="space-y-2.5">
                {ticket.drafts
                  .filter((d) => d.status !== "PENDING")
                  .map((draft) => (
                    <details key={draft.id} className="group rounded-xl border border-blush-100 bg-cream-50">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge
                            className={
                              draft.status === "APPROVED"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : draft.status === "EDITED"
                                  ? "border-blush-300 bg-blush-100 text-plum-700"
                                  : "border-cream-300 bg-cream-200 text-ink-500"
                            }
                          >
                            {humanise(draft.status)}
                          </Badge>
                          <span className="truncate text-xs text-ink-400">
                            {draft.generatedBy} · {timeAgo(draft.createdAt)}
                            {draft.approvedBy ? ` · reviewed by ${draft.approvedBy.name}` : ""}
                          </span>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-ink-400 transition group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-blush-100 px-4 py-3">
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-600">
                          {draft.finalBody ?? draft.body}
                        </p>
                        {draft.rejectionReason && (
                          <p className="mt-2 text-xs italic text-rose-600">Reason: {draft.rejectionReason}</p>
                        )}
                      </div>
                    </details>
                  ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* AI analysis */}
          {ticket.triagedByAi && (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-blush-100 bg-blush-50/60 px-5 py-3">
                <Sparkles className="h-4 w-4 text-rose-400" />
                <p className="font-display text-sm font-600 text-plum-800">AI analysis</p>
              </div>
              <div className="space-y-3.5 p-5">
                {ticket.aiConfidence !== null && <ConfidenceMeter value={ticket.aiConfidence} />}
                {ticket.aiSummary && (
                  <div>
                    <p className="label">Summary</p>
                    <p className="text-sm leading-relaxed text-ink-600">{ticket.aiSummary}</p>
                  </div>
                )}
                {ticket.aiIntent && (
                  <div>
                    <p className="label">Intent</p>
                    <p className="text-sm text-ink-600">{ticket.aiIntent}</p>
                  </div>
                )}
                {ticket.aiReasoning && (
                  <div>
                    <p className="label">Reasoning</p>
                    <p className="text-xs leading-relaxed text-ink-500">{ticket.aiReasoning}</p>
                  </div>
                )}
                {ticket.tags.length > 0 && (
                  <div>
                    <p className="label">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ticket.tags.map((tag) => (
                        <Badge key={tag} className="border-blush-200 bg-white text-ink-500">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="label">Sentiment score</p>
                  <div className="flex items-center gap-2">
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-blush-100">
                      <div
                        className={cn(
                          "absolute top-0 h-full rounded-full",
                          ticket.sentimentScore < 0 ? "bg-rose-500" : "bg-emerald-500",
                        )}
                        style={{
                          // Centre is neutral; bar grows left for negative, right for positive.
                          left: ticket.sentimentScore < 0 ? `${50 + ticket.sentimentScore * 50}%` : "50%",
                          width: `${Math.abs(ticket.sentimentScore) * 50}%`,
                        }}
                      />
                      <div className="absolute left-1/2 top-0 h-full w-px bg-ink-400/40" />
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-ink-500">
                      {ticket.sentimentScore > 0 ? "+" : ""}
                      {ticket.sentimentScore.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Properties */}
          <Card className="p-5">
            <SectionHeader title="Properties" />
            <div className="space-y-3">
              <Select
                label="Status"
                value={ticket.status}
                onChange={(e) => update.mutate({ status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{humanise(s)}</option>
                ))}
              </Select>
              <Select
                label="Priority"
                value={ticket.priority}
                onChange={(e) => update.mutate({ priority: e.target.value })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{humanise(p)}</option>
                ))}
              </Select>
              <Select
                label="Category"
                value={ticket.category}
                onChange={(e) => update.mutate({ category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </Select>
              <Select
                label="Assignee"
                value={ticket.assigneeId ?? ""}
                onChange={(e) => update.mutate({ assigneeId: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </div>
          </Card>

          {/* SLA */}
          <Card className="p-5">
            <SectionHeader title="SLA" icon={<Timer className="h-4.5 w-4.5" />} />
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-400">State</span>
                <Badge className={SLA_STYLE[ticket.sla.state].chip}>{SLA_STYLE[ticket.sla.state].label}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-400">First response due</span>
                <span className="font-medium text-ink-700">{dateTime(ticket.sla.firstResponseDueAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-400">Responded</span>
                <span className="font-medium text-ink-700">
                  {ticket.firstResponseAt ? dateTime(ticket.firstResponseAt) : "Not yet"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-400">Resolution due</span>
                <span className="font-medium text-ink-700">{dateTime(ticket.sla.resolutionDueAt)}</span>
              </div>
              {ticket.slaPolicy && (
                <p className="border-t border-blush-100 pt-3 text-xs text-ink-400">
                  Policy: {ticket.slaPolicy.name}
                </p>
              )}
            </div>
          </Card>

          {/* Customer */}
          <Card className="p-5">
            <SectionHeader title="Customer" icon={<UserIcon className="h-4.5 w-4.5" />} />
            <Link to={`/customers?search=${encodeURIComponent(ticket.customer.email)}`} className="block">
              <div className="flex items-center gap-3">
                <Avatar name={ticket.customer.name} hue={300} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-plum-800">{ticket.customer.name}</p>
                  <p className="truncate text-xs text-ink-400">{ticket.customer.email}</p>
                </div>
              </div>
            </Link>
            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-400">Tier</span>
                <Badge className={TIER_STYLE[ticket.customer.tier].chip}>
                  {TIER_STYLE[ticket.customer.tier].label}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-400">Visits</span>
                <span className="font-medium text-ink-700">{ticket.customer.totalVisits}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-400">Lifetime value</span>
                <span className="font-medium text-ink-700">{money(ticket.customer.lifetimeValue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-400">Last visit</span>
                <span className="font-medium text-ink-700">{timeAgo(ticket.customer.lastVisitAt)}</span>
              </div>
            </div>
            {ticket.customer.allergies && (
              <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/8 px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-rose-600">Allergies</p>
                <p className="mt-0.5 text-xs text-ink-600">{ticket.customer.allergies}</p>
              </div>
            )}
            {ticket.customer.notes && (
              <p className="mt-3 border-t border-blush-100 pt-3 text-xs leading-relaxed text-ink-500">
                {ticket.customer.notes}
              </p>
            )}
          </Card>

          {/* Escalations */}
          {ticket.escalations && ticket.escalations.length > 0 && (
            <Card className="p-5">
              <SectionHeader title="Escalations" icon={<AlertTriangle className="h-4.5 w-4.5" />} />
              <div className="space-y-2.5">
                {ticket.escalations.map((esc) => (
                  <div key={esc.id} className="rounded-xl border border-rose-400/30 bg-rose-500/5 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-rose-600">
                        {ESCALATION_LABEL[esc.level] ?? esc.level}
                      </span>
                      <Badge className="border-rose-400/40 bg-white text-rose-600">{humanise(esc.status)}</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-600">{esc.reason}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-400">
                      {timeAgo(esc.triggeredAt)}{esc.slackSent && " · Slack alerted"}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Audit trail */}
          <Card className="p-5">
            <SectionHeader title="Activity" icon={<Clock className="h-4.5 w-4.5" />} />
            <div className="space-y-3">
              {ticket.events?.map((event) => (
                <div key={event.id} className="border-l-2 border-blush-200 pl-3">
                  <p className="text-xs leading-relaxed text-ink-600">{event.message}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-400">
                    {event.actorName} · {timeAgo(event.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Escalate modal */}
      <Modal
        open={escalateOpen}
        onClose={() => setEscalateOpen(false)}
        title="Escalate this ticket"
        description="Raises an escalation, alerts Slack and notifies the team."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEscalateOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={escalate.isPending}
              disabled={escalateReason.trim().length < 3}
              onClick={() => escalate.mutate()}
            >
              Escalate now
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason"
          rows={4}
          value={escalateReason}
          onChange={(e) => setEscalateReason(e.target.value)}
          placeholder="Why does this need a manager?"
          hint="This text goes into the Slack alert and the audit trail."
        />
      </Modal>
    </div>
  );
}

/** The approval gate: review, edit, approve, or discard the AI's draft. */
function DraftReviewCard({ draft, onDone }: { draft: ReplyDraft; onDone: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(draft.body);
  const [showSources, setShowSources] = useState(false);

  // A regenerated draft must replace what's in the editor.
  useEffect(() => {
    setBody(draft.body);
    setEditing(false);
  }, [draft.id, draft.body]);

  const approve = useMutation({
    mutationFn: () =>
      api.post(`/tickets/drafts/${draft.id}/approve`, editing ? { finalBody: body } : {}),
    onSuccess: () => {
      onDone();
      toast.success(editing ? "Edited reply sent" : "Draft approved and sent");
    },
    onError: (err: Error) => toast.error("Could not send", err.message),
  });

  const reject = useMutation({
    mutationFn: () => api.post(`/tickets/drafts/${draft.id}/reject`, { reason: "Not suitable" }),
    onSuccess: () => {
      onDone();
      toast.info("Draft discarded");
    },
    onError: (err: Error) => toast.error("Could not discard", err.message),
  });

  return (
    <Card className="overflow-hidden border-blush-300">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blush-100 bg-blush-50/70 px-5 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-rose-400" />
          <p className="font-display text-sm font-600 text-plum-800">AI reply — awaiting your approval</p>
        </div>
        <div className="flex items-center gap-3">
          <ConfidenceMeter value={draft.confidence} />
          <Badge className="border-blush-200 bg-white text-ink-500">{draft.generatedBy}</Badge>
        </div>
      </div>

      <div className="p-5">
        {editing ? (
          <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
        ) : (
          <p className="whitespace-pre-wrap rounded-xl border border-blush-100 bg-cream-50 px-4 py-3.5 text-sm leading-relaxed text-ink-700">
            {draft.body}
          </p>
        )}

        {/* RAG provenance */}
        {draft.citations.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowSources((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-rose-500 hover:text-rose-600"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {draft.citations.length} knowledge base {draft.citations.length === 1 ? "source" : "sources"}
              <ChevronDown className={cn("h-3.5 w-3.5 transition", showSources && "rotate-180")} />
            </button>

            {showSources && (
              <div className="mt-2.5 space-y-2">
                {draft.citations.map((citation) => (
                  <div key={citation.chunkId} className="rounded-xl border border-blush-100 bg-white px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-plum-800">{citation.title}</p>
                      <span className="shrink-0 font-mono text-[10px] text-ink-400">
                        {citation.score.toFixed(3)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-ink-500">
                      {citation.snippet}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            loading={reject.isPending}
            onClick={() => reject.mutate()}
          >
            Discard
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "Cancel edit" : "Edit"}
            </Button>
            <Button
              icon={<Check className="h-4 w-4" />}
              loading={approve.isPending}
              disabled={editing && !body.trim()}
              onClick={() => approve.mutate()}
            >
              {editing ? "Send edited reply" : "Approve & send"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function DraftEmpty() {
  return <EmptyState icon={<Sparkles className="h-5 w-5" />} title="No drafts yet" />;
}
