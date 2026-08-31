import type { EscalationLevel, Priority } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { alertEscalation } from "./slack.service";
import { logEvent, notify } from "./notification.service";
import { notFound } from "../middleware/error";

export type EscalationTrigger = "SLA_BREACH" | "SENTIMENT" | "MANUAL" | "VIP_URGENT" | "AI_RECOMMENDED";

/** Who gets pulled in, based on how bad it is. */
export function chooseLevel(priority: Priority, trigger: EscalationTrigger): EscalationLevel {
  if (priority === "URGENT") return "L3_SALON_DIRECTOR";
  if (trigger === "SLA_BREACH" && priority === "HIGH") return "L2_SHIFT_MANAGER";
  if (trigger === "VIP_URGENT" || trigger === "SENTIMENT") return "L2_SHIFT_MANAGER";
  return "L1_SENIOR_AGENT";
}

interface EscalateOptions {
  reason: string;
  trigger: EscalationTrigger;
  level?: EscalationLevel;
  actorId?: string | null;
  actorName?: string;
}

/**
 * Escalate a ticket: record it, flag the ticket, alert Slack, notify the team.
 * Idempotent per trigger — an already-open escalation with the same trigger is
 * returned untouched so the SLA scanner can't spam the channel.
 */
export async function escalateTicket(ticketId: string, options: EscalateOptions) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { customer: true, escalations: { where: { status: { not: "RESOLVED" } } } },
  });
  if (!ticket) throw notFound("Ticket not found");

  const existing = ticket.escalations.find((e) => e.trigger === options.trigger);
  if (existing) return existing;

  const level = options.level ?? chooseLevel(ticket.priority, options.trigger);

  const escalation = await prisma.escalation.create({
    data: {
      ticketId,
      level,
      reason: options.reason,
      trigger: options.trigger,
      status: "OPEN",
    },
  });

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      isEscalated: true,
      status: ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? ticket.status : "ESCALATED",
    },
  });

  const alert = await alertEscalation(ticket, options.reason, level, ticket.customer.name);
  if (alert) {
    await prisma.escalation.update({
      where: { id: escalation.id },
      data: { slackSent: alert.status === "SENT" || alert.status === "SIMULATED" },
    });
  }

  await logEvent(ticketId, "ESCALATED", `Escalated to ${level.replace(/_/g, " ")} — ${options.reason}`, {
    actorId: options.actorId,
    actorName: options.actorName ?? "SLA Monitor",
    meta: { level, trigger: options.trigger },
  });

  await notify({
    type: "ESCALATION",
    title: `Ticket #${ticket.number} escalated`,
    body: `${options.reason} · ${level.replace(/_/g, " ")}`,
    ticketId,
  });

  logger.warn("escalation", `#${ticket.number} → ${level} (${options.trigger})`);
  return escalation;
}

export async function acknowledgeEscalation(id: string, userId: string, userName: string) {
  const escalation = await prisma.escalation.findUnique({ where: { id } });
  if (!escalation) throw notFound("Escalation not found");

  const updated = await prisma.escalation.update({
    where: { id },
    data: { status: "ACKNOWLEDGED", acknowledgedBy: userName },
  });

  await logEvent(escalation.ticketId, "ESCALATION_ACK", `${userName} acknowledged the escalation`, {
    actorId: userId,
    actorName: userName,
  });

  return updated;
}

export async function resolveEscalation(id: string, userId: string, userName: string) {
  const escalation = await prisma.escalation.findUnique({ where: { id } });
  if (!escalation) throw notFound("Escalation not found");

  const updated = await prisma.escalation.update({
    where: { id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  const stillOpen = await prisma.escalation.count({
    where: { ticketId: escalation.ticketId, status: { not: "RESOLVED" } },
  });
  if (stillOpen === 0) {
    await prisma.ticket.update({
      where: { id: escalation.ticketId },
      data: { isEscalated: false },
    });
  }

  await logEvent(escalation.ticketId, "ESCALATION_RESOLVED", `${userName} closed the escalation`, {
    actorId: userId,
    actorName: userName,
  });

  return updated;
}
