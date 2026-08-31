/**
 * The support workflow, end to end:
 *
 *   Customer Message → AI Triage → RAG Search → AI Reply Draft
 *     → Agent Approval → SLA Monitoring → Escalation → Slack Alert → Resolution
 *
 * Each step here is a single exported function so it can be driven from the API,
 * from the seed, or from the AI Triage page's "run" buttons.
 */

import type { Channel, Prisma, Ticket } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { draftReply, triageTicket } from "./ai.service";
import { searchKnowledge } from "./rag.service";
import { applySlaPolicy, recordFirstResponse, recordResolution } from "./sla.service";
import { escalateTicket } from "./escalation.service";
import { logEvent, notify } from "./notification.service";
import { badRequest, notFound } from "../middleware/error";
import type { AuthUser } from "../middleware/auth";
import type { RagCitation } from "../types/ai";

export const ticketInclude = {
  customer: true,
  assignee: { select: { id: true, name: true, email: true, avatarHue: true, title: true } },
  slaPolicy: true,
} satisfies Prisma.TicketInclude;

// ───────────────────────── 1. Intake ─────────────────────────

export interface IntakeInput {
  subject: string;
  body: string;
  channel?: Channel;
  customerId?: string;
  customerEmail?: string;
  customerName?: string;
  autoTriage?: boolean;
}

/** Creates (or reuses) the customer, opens the ticket, stores the first message. */
export async function intakeMessage(input: IntakeInput) {
  let customerId = input.customerId;

  if (!customerId) {
    if (!input.customerEmail) throw badRequest("Provide either customerId or customerEmail");
    const customer = await prisma.customer.upsert({
      where: { email: input.customerEmail.toLowerCase() },
      update: {},
      create: {
        email: input.customerEmail.toLowerCase(),
        name: input.customerName?.trim() || input.customerEmail.split("@")[0],
        tier: "NEW",
      },
    });
    customerId = customer.id;
  }

  const ticket = await prisma.ticket.create({
    data: {
      subject: input.subject.trim(),
      channel: input.channel ?? "EMAIL",
      customerId,
      status: "NEW",
    },
    include: ticketInclude,
  });

  await prisma.message.create({
    data: {
      ticketId: ticket.id,
      authorType: "CUSTOMER",
      authorName: ticket.customer.name,
      body: input.body.trim(),
    },
  });

  await logEvent(ticket.id, "CREATED", `Ticket opened via ${ticket.channel.replace("_", " ").toLowerCase()}`, {
    actorName: ticket.customer.name,
  });

  await notify({
    type: "TICKET_CREATED",
    title: `New ticket #${ticket.number}`,
    body: `${ticket.customer.name}: ${ticket.subject}`,
    ticketId: ticket.id,
  });

  if (input.autoTriage !== false) {
    return runTriage(ticket.id);
  }

  return prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, include: ticketInclude });
}

// ───────────────────────── 2. AI Triage ─────────────────────────

/**
 * Classifies the ticket, stamps SLA deadlines from the resulting priority, and
 * escalates immediately when the classifier says a manager is needed.
 */
export async function runTriage(ticketId: string, actor?: AuthUser) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { customer: true, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) throw notFound("Ticket not found");

  const customerMessages = ticket.messages.filter((m) => m.authorType === "CUSTOMER");
  const latest = customerMessages[customerMessages.length - 1];
  if (!latest) throw badRequest("Ticket has no customer message to triage");

  const result = await triageTicket({
    subject: ticket.subject,
    body: latest.body,
    channel: ticket.channel,
    customer: {
      name: ticket.customer.name,
      tier: ticket.customer.tier,
      totalVisits: ticket.customer.totalVisits,
      lifetimeValue: ticket.customer.lifetimeValue,
      lastVisitAt: ticket.customer.lastVisitAt,
    },
    history: ticket.messages.slice(0, -1).map((m) => ({ authorType: m.authorType, body: m.body })),
  });

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      category: result.category,
      priority: result.priority,
      sentiment: result.sentiment,
      sentimentScore: result.sentimentScore,
      aiSummary: result.summary,
      aiIntent: result.intent,
      aiConfidence: result.confidence,
      aiReasoning: result.reasoning,
      aiSuggestedTags: result.tags,
      tags: result.tags,
      triagedByAi: true,
      triagedAt: new Date(),
      status: ticket.status === "NEW" ? "TRIAGED" : ticket.status,
    },
  });

  await applySlaPolicy(ticketId, result.priority);

  await logEvent(
    ticketId,
    "TRIAGED",
    `Classified as ${result.category.replace(/_/g, " ").toLowerCase()} · ${result.priority.toLowerCase()} priority · ${result.sentiment.toLowerCase()} (${Math.round(result.confidence * 100)}% confidence)`,
    { actorId: actor?.id, actorName: actor?.name ?? `AI Triage (${result.engine})`, meta: { engine: result.engine, model: result.model } },
  );

  if (result.escalationRecommended) {
    await escalateTicket(ticketId, {
      trigger: "AI_RECOMMENDED",
      reason: `AI triage flagged this for manager attention: ${result.reasoning}`,
      actorName: "AI Triage",
    });
  }

  logger.info("triage", `#${ticket.number} → ${result.category}/${result.priority} via ${result.engine}`);

  return prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, include: ticketInclude });
}

// ──────────────── 3 + 4. RAG search → AI reply draft ────────────────

/** Builds the retrieval query from the subject plus the newest customer message. */
function buildRetrievalQuery(subject: string, latestBody: string) {
  return `${subject}. ${latestBody}`.slice(0, 1200);
}

export async function generateDraft(ticketId: string, agent: AuthUser) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { customer: true, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) throw notFound("Ticket not found");

  const customerMessages = ticket.messages.filter((m) => m.authorType === "CUSTOMER");
  const latest = customerMessages[customerMessages.length - 1];
  if (!latest) throw badRequest("Nothing to reply to yet");

  const citations: RagCitation[] = await searchKnowledge(
    buildRetrievalQuery(ticket.subject, latest.body),
  );

  const result = await draftReply({
    ticket: {
      number: ticket.number,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      sentiment: ticket.sentiment,
      channel: ticket.channel,
    },
    customer: {
      name: ticket.customer.name,
      tier: ticket.customer.tier,
      totalVisits: ticket.customer.totalVisits,
      preferredTech: ticket.customer.preferredTech,
    },
    conversation: ticket.messages
      .filter((m) => !m.isInternal)
      .map((m) => ({ authorType: m.authorType, authorName: m.authorName, body: m.body })),
    citations,
    agentName: agent.name,
  });

  // Supersede any earlier untouched draft so the queue shows one live suggestion.
  await prisma.replyDraft.updateMany({
    where: { ticketId, status: "PENDING" },
    data: { status: "REJECTED", rejectionReason: "Superseded by a newer draft" },
  });

  const draft = await prisma.replyDraft.create({
    data: {
      ticketId,
      body: result.body,
      confidence: result.confidence,
      tone: result.tone,
      model: result.model,
      generatedBy: result.engine === "claude" ? "Claude" : "Demo Engine",
      citations: citations as unknown as Prisma.InputJsonValue,
    },
  });

  await logEvent(
    ticketId,
    "DRAFT_GENERATED",
    `AI drafted a reply from ${citations.length} knowledge base ${citations.length === 1 ? "passage" : "passages"} (${Math.round(result.confidence * 100)}% confidence)`,
    { actorId: agent.id, actorName: `${agent.name} · ${result.engine === "claude" ? "Claude" : "Demo Engine"}`, meta: { engine: result.engine } },
  );

  await notify({
    type: "DRAFT_READY",
    title: `Draft ready for #${ticket.number}`,
    body: `A reply is waiting for your approval on "${ticket.subject}".`,
    ticketId,
    userId: ticket.assigneeId ?? agent.id,
  });

  return { draft, citations, engine: result.engine };
}

// ───────────────── 5. Agent approval → send ─────────────────

export async function approveDraft(
  draftId: string,
  agent: AuthUser,
  finalBody?: string,
) {
  const draft = await prisma.replyDraft.findUnique({
    where: { id: draftId },
    include: { ticket: { include: { customer: true } } },
  });
  if (!draft) throw notFound("Draft not found");
  if (draft.status === "APPROVED" || draft.status === "EDITED") {
    throw badRequest("This draft has already been sent");
  }

  const body = (finalBody ?? draft.body).trim();
  if (!body) throw badRequest("Reply body cannot be empty");

  const wasEdited = body !== draft.body.trim();

  const updated = await prisma.replyDraft.update({
    where: { id: draftId },
    data: {
      status: wasEdited ? "EDITED" : "APPROVED",
      finalBody: body,
      approvedById: agent.id,
      reviewedAt: new Date(),
    },
  });

  await prisma.message.create({
    data: {
      ticketId: draft.ticketId,
      authorType: "AGENT",
      authorId: agent.id,
      authorName: agent.name,
      body,
    },
  });

  await recordFirstResponse(draft.ticketId);

  await prisma.ticket.update({
    where: { id: draft.ticketId },
    data: {
      status: draft.ticket.status === "ESCALATED" ? "ESCALATED" : "IN_PROGRESS",
      assigneeId: draft.ticket.assigneeId ?? agent.id,
    },
  });

  await logEvent(
    draft.ticketId,
    wasEdited ? "DRAFT_EDITED" : "DRAFT_APPROVED",
    wasEdited
      ? `${agent.name} edited and sent the AI draft`
      : `${agent.name} approved and sent the AI draft as written`,
    { actorId: agent.id, actorName: agent.name },
  );

  return updated;
}

export async function rejectDraft(draftId: string, agent: AuthUser, reason?: string) {
  const draft = await prisma.replyDraft.findUnique({ where: { id: draftId } });
  if (!draft) throw notFound("Draft not found");

  const updated = await prisma.replyDraft.update({
    where: { id: draftId },
    data: {
      status: "REJECTED",
      approvedById: agent.id,
      reviewedAt: new Date(),
      rejectionReason: reason ?? "Not suitable",
    },
  });

  await logEvent(draft.ticketId, "DRAFT_REJECTED", `${agent.name} discarded the AI draft${reason ? ` — ${reason}` : ""}`, {
    actorId: agent.id,
    actorName: agent.name,
  });

  return updated;
}

// ───────────────── 6. Resolution ─────────────────

export async function resolveTicket(ticketId: string, agent: AuthUser, csatScore?: number) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw notFound("Ticket not found");

  await recordResolution(ticketId);

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: "RESOLVED",
      csatScore: csatScore ?? ticket.csatScore,
      isEscalated: false,
    },
    include: ticketInclude,
  });

  await prisma.escalation.updateMany({
    where: { ticketId, status: { not: "RESOLVED" } },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  await logEvent(ticketId, "RESOLVED", `${agent.name} marked the ticket resolved`, {
    actorId: agent.id,
    actorName: agent.name,
  });

  await notify({
    type: "RESOLUTION",
    title: `Ticket #${ticket.number} resolved`,
    body: `${agent.name} closed out "${ticket.subject}".`,
    ticketId,
  });

  return updated;
}

/** Attaches the computed SLA snapshot to a ticket for API responses. */
export function withSla<T extends Ticket>(ticket: T, compute: (t: Ticket) => unknown) {
  return { ...ticket, sla: compute(ticket) };
}
