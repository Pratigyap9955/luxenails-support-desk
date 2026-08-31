import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { applySlaPolicy, computeSla, recordFirstResponse } from "../services/sla.service";
import {
  approveDraft,
  generateDraft,
  intakeMessage,
  rejectDraft,
  resolveTicket,
  runTriage,
  ticketInclude,
} from "../services/workflow.service";
import { logEvent } from "../services/notification.service";
import { escalateTicket } from "../services/escalation.service";

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

const STATUSES = ["NEW", "TRIAGED", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"] as const;
const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
const CATEGORIES = [
  "BOOKING", "CANCELLATION", "REFUND", "COMPLAINT", "SERVICE_QUESTION", "PRODUCT_QUESTION",
  "AFTERCARE", "PRICING", "GIFT_CARD", "MEMBERSHIP", "FEEDBACK", "OTHER",
] as const;
const CHANNELS = ["EMAIL", "CHAT", "INSTAGRAM", "PHONE", "WEB_FORM", "SMS"] as const;
const SENTIMENTS = ["DELIGHTED", "POSITIVE", "NEUTRAL", "FRUSTRATED", "ANGRY"] as const;

const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: z.enum(CATEGORIES).optional(),
  sentiment: z.enum(SENTIMENTS).optional(),
  slaState: z.enum(["ON_TRACK", "AT_RISK", "BREACHED", "MET"]).optional(),
  assigneeId: z.string().optional(),
  customerId: z.string().optional(),
  escalated: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  sort: z.enum(["newest", "oldest", "priority", "sla"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** URGENT first — Prisma sorts enums alphabetically, which isn't what we want. */
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

ticketsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);

    const where: Prisma.TicketWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.sentiment ? { sentiment: q.sentiment } : {}),
      ...(q.slaState ? { slaState: q.slaState } : {}),
      ...(q.assigneeId ? { assigneeId: q.assigneeId === "unassigned" ? null : q.assigneeId } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.escalated ? { isEscalated: q.escalated === "true" } : {}),
      ...(q.search
        ? {
            OR: [
              { subject: { contains: q.search, mode: "insensitive" } },
              { aiSummary: { contains: q.search, mode: "insensitive" } },
              { customer: { name: { contains: q.search, mode: "insensitive" } } },
              { customer: { email: { contains: q.search, mode: "insensitive" } } },
              ...(Number.isFinite(Number(q.search)) ? [{ number: Number(q.search) }] : []),
            ],
          }
        : {}),
    };

    const orderBy: Prisma.TicketOrderByWithRelationInput =
      q.sort === "oldest" ? { createdAt: "asc" } : { createdAt: "desc" };

    const [total, rows] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        include: {
          ...ticketInclude,
          _count: { select: { messages: true, drafts: true } },
        },
        orderBy,
        // Priority and SLA sorts need the computed snapshot, so page after sorting.
        ...(q.sort === "priority" || q.sort === "sla"
          ? {}
          : { skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      }),
    ]);

    let tickets = rows.map((t) => ({ ...t, sla: computeSla(t) }));

    if (q.sort === "priority") {
      tickets.sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
      tickets = tickets.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    } else if (q.sort === "sla") {
      tickets.sort((a, b) => (a.sla.msRemaining ?? Infinity) - (b.sla.msRemaining ?? Infinity));
      tickets = tickets.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    }

    res.json({
      tickets,
      pagination: { page: q.page, pageSize: q.pageSize, total, pages: Math.ceil(total / q.pageSize) },
    });
  }),
);

ticketsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        ...ticketInclude,
        messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, avatarHue: true } } } },
        drafts: { orderBy: { createdAt: "desc" }, include: { approvedBy: { select: { name: true } } } },
        escalations: { orderBy: { triggeredAt: "desc" } },
        events: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!ticket) throw notFound("Ticket not found");

    res.json({ ticket: { ...ticket, sla: computeSla(ticket) } });
  }),
);

const createSchema = z.object({
  subject: z.string().min(3, "Subject is too short"),
  body: z.string().min(5, "Message is too short"),
  channel: z.enum(CHANNELS).default("EMAIL"),
  customerId: z.string().optional(),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
  autoTriage: z.boolean().default(true),
});

/** Step 1 of the workflow — customer message in, AI triage optionally fired. */
ticketsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    if (!input.customerId && !input.customerEmail) {
      throw badRequest("Select an existing customer or provide an email address");
    }
    const ticket = await intakeMessage(input);
    res.status(201).json({ ticket: { ...ticket, sla: computeSla(ticket) } });
  }),
);

const updateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: z.enum(CATEGORIES).optional(),
  assigneeId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  subject: z.string().min(3).optional(),
  csatScore: z.number().int().min(1).max(5).nullable().optional(),
});

ticketsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const before = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound("Ticket not found");

    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data: input,
      include: ticketInclude,
    });

    const agent = req.user!;

    // Changing priority re-derives the SLA clock from the new policy.
    if (input.priority && input.priority !== before.priority) {
      await applySlaPolicy(ticket.id, input.priority);
      await logEvent(ticket.id, "PRIORITY_CHANGED", `Priority ${before.priority} → ${input.priority}`, {
        actorId: agent.id,
        actorName: agent.name,
      });
    }
    if (input.status && input.status !== before.status) {
      await logEvent(ticket.id, "STATUS_CHANGED", `Status ${before.status.replace(/_/g, " ")} → ${input.status.replace(/_/g, " ")}`, {
        actorId: agent.id,
        actorName: agent.name,
      });
    }
    if (input.assigneeId !== undefined && input.assigneeId !== before.assigneeId) {
      const assignee = input.assigneeId
        ? await prisma.user.findUnique({ where: { id: input.assigneeId }, select: { name: true } })
        : null;
      await logEvent(ticket.id, "ASSIGNED", assignee ? `Assigned to ${assignee.name}` : "Unassigned", {
        actorId: agent.id,
        actorName: agent.name,
      });
    }

    const fresh = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, include: ticketInclude });
    res.json({ ticket: { ...fresh, sla: computeSla(fresh) } });
  }),
);

/** Step 2 — re-run AI triage on demand. */
ticketsRouter.post(
  "/:id/triage",
  asyncHandler(async (req, res) => {
    const ticket = await runTriage(req.params.id, req.user!);
    res.json({ ticket: { ...ticket, sla: computeSla(ticket) } });
  }),
);

/** Steps 3 + 4 — RAG search then AI reply draft. */
ticketsRouter.post(
  "/:id/draft",
  asyncHandler(async (req, res) => {
    const { draft, citations, engine } = await generateDraft(req.params.id, req.user!);
    res.status(201).json({ draft, citations, engine });
  }),
);

const messageSchema = z.object({
  body: z.string().min(1, "Message cannot be empty"),
  authorType: z.enum(["AGENT", "CUSTOMER"]).default("AGENT"),
  isInternal: z.boolean().default(false),
});

ticketsRouter.post(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const input = messageSchema.parse(req.body);
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: { customer: true },
    });
    if (!ticket) throw notFound("Ticket not found");

    const agent = req.user!;
    const isCustomer = input.authorType === "CUSTOMER";

    const message = await prisma.message.create({
      data: {
        ticketId: ticket.id,
        authorType: input.authorType,
        authorId: isCustomer ? null : agent.id,
        authorName: isCustomer ? ticket.customer.name : agent.name,
        body: input.body,
        isInternal: input.isInternal,
      },
    });

    if (!isCustomer && !input.isInternal) {
      await recordFirstResponse(ticket.id);
      if (ticket.status === "NEW" || ticket.status === "TRIAGED") {
        await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "IN_PROGRESS" } });
      }
    }

    if (isCustomer) {
      // A customer reply reopens a waiting ticket.
      if (ticket.status === "WAITING_ON_CUSTOMER") {
        await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "IN_PROGRESS" } });
      }
    }

    await logEvent(
      ticket.id,
      input.isInternal ? "INTERNAL_NOTE" : "MESSAGE",
      input.isInternal ? `${agent.name} added an internal note` : `${isCustomer ? ticket.customer.name : agent.name} sent a message`,
      { actorId: isCustomer ? null : agent.id, actorName: isCustomer ? ticket.customer.name : agent.name },
    );

    res.status(201).json({ message });
  }),
);

/** Step 5 — agent approves (optionally edited) or rejects the AI draft. */
ticketsRouter.post(
  "/drafts/:draftId/approve",
  asyncHandler(async (req, res) => {
    const schema = z.object({ finalBody: z.string().optional() });
    const { finalBody } = schema.parse(req.body ?? {});
    const draft = await approveDraft(req.params.draftId, req.user!, finalBody);
    res.json({ draft });
  }),
);

ticketsRouter.post(
  "/drafts/:draftId/reject",
  asyncHandler(async (req, res) => {
    const schema = z.object({ reason: z.string().optional() });
    const { reason } = schema.parse(req.body ?? {});
    const draft = await rejectDraft(req.params.draftId, req.user!, reason);
    res.json({ draft });
  }),
);

/** Every pending draft across the desk — powers the AI Triage approval queue. */
ticketsRouter.get(
  "/drafts/pending",
  asyncHandler(async (_req, res) => {
    const drafts = await prisma.replyDraft.findMany({
      where: { status: "PENDING" },
      include: { ticket: { include: { customer: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ drafts });
  }),
);

/** Step 7 — manual escalation. */
ticketsRouter.post(
  "/:id/escalate",
  asyncHandler(async (req, res) => {
    const schema = z.object({
      reason: z.string().min(3, "Give a reason for the escalation"),
      level: z.enum(["L1_SENIOR_AGENT", "L2_SHIFT_MANAGER", "L3_SALON_DIRECTOR"]).optional(),
    });
    const input = schema.parse(req.body);
    const escalation = await escalateTicket(req.params.id, {
      reason: input.reason,
      level: input.level,
      trigger: "MANUAL",
      actorId: req.user!.id,
      actorName: req.user!.name,
    });
    res.status(201).json({ escalation });
  }),
);

/** Step 9 — resolution. */
ticketsRouter.post(
  "/:id/resolve",
  asyncHandler(async (req, res) => {
    const schema = z.object({ csatScore: z.number().int().min(1).max(5).optional() });
    const { csatScore } = schema.parse(req.body ?? {});
    const ticket = await resolveTicket(req.params.id, req.user!, csatScore);
    res.json({ ticket: { ...ticket, sla: computeSla(ticket) } });
  }),
);
