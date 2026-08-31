/**
 * SLA engine.
 *
 * Each priority has a policy (first-response minutes, resolution minutes,
 * auto-escalate grace period). Applying a policy stamps absolute due timestamps
 * on the ticket; the background scanner then re-evaluates every open ticket,
 * raises warnings at the configured threshold, marks breaches, and hands
 * anything past the grace period to the escalation service.
 */

import type { Priority, Ticket, TicketStatus } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { logEvent, notify } from "./notification.service";
import { escalateTicket } from "./escalation.service";

const OPEN_STATUSES: TicketStatus[] = ["NEW", "TRIAGED", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "ESCALATED"];

/** Fallback targets used when the database has no policy row for a priority. */
const DEFAULT_POLICIES: Record<Priority, { firstResponseMins: number; resolutionMins: number; escalateAfterMins: number }> = {
  URGENT: { firstResponseMins: 15, resolutionMins: 120, escalateAfterMins: 15 },
  HIGH: { firstResponseMins: 60, resolutionMins: 480, escalateAfterMins: 60 },
  MEDIUM: { firstResponseMins: 240, resolutionMins: 1440, escalateAfterMins: 240 },
  LOW: { firstResponseMins: 720, resolutionMins: 4320, escalateAfterMins: 720 },
};

const minutes = (n: number) => n * 60_000;

/**
 * Stamps first-response and resolution deadlines onto a ticket.
 * Deadlines run from ticket creation, so re-prioritising an old ticket
 * correctly reflects the time already spent.
 */
export async function applySlaPolicy(ticketId: string, priority: Priority) {
  const policy =
    (await prisma.slaPolicy.findFirst({ where: { priority, active: true } })) ?? null;

  const targets = policy
    ? {
        firstResponseMins: policy.firstResponseMins,
        resolutionMins: policy.resolutionMins,
      }
    : DEFAULT_POLICIES[priority];

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { createdAt: true } });
  const start = ticket?.createdAt ?? new Date();

  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      slaPolicyId: policy?.id ?? null,
      firstResponseDueAt: new Date(start.getTime() + minutes(targets.firstResponseMins)),
      resolutionDueAt: new Date(start.getTime() + minutes(targets.resolutionMins)),
    },
  });
}

export interface SlaSnapshot {
  state: "ON_TRACK" | "AT_RISK" | "BREACHED" | "MET";
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  /** Milliseconds until the next live deadline; negative once breached. */
  msRemaining: number | null;
  /** 0..1+ share of the SLA window consumed. */
  elapsedRatio: number;
  firstResponseMet: boolean | null;
  resolutionMet: boolean | null;
  nextDeadline: "FIRST_RESPONSE" | "RESOLUTION" | null;
}

/** Pure calculation — no writes. Used by list endpoints and the SLA Monitor. */
export function computeSla(ticket: Ticket, now = new Date()): SlaSnapshot {
  const closed = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

  const firstResponseMet =
    ticket.firstResponseAt && ticket.firstResponseDueAt
      ? ticket.firstResponseAt <= ticket.firstResponseDueAt
      : null;

  const resolutionMet =
    ticket.resolvedAt && ticket.resolutionDueAt ? ticket.resolvedAt <= ticket.resolutionDueAt : null;

  if (closed) {
    return {
      state: resolutionMet === false || firstResponseMet === false ? "BREACHED" : "MET",
      firstResponseDueAt: ticket.firstResponseDueAt,
      resolutionDueAt: ticket.resolutionDueAt,
      msRemaining: null,
      elapsedRatio: 1,
      firstResponseMet,
      resolutionMet,
      nextDeadline: null,
    };
  }

  // The live deadline is first response until we've replied, then resolution.
  const awaitingFirstResponse = !ticket.firstResponseAt;
  const deadline = awaitingFirstResponse ? ticket.firstResponseDueAt : ticket.resolutionDueAt;
  const nextDeadline = awaitingFirstResponse ? "FIRST_RESPONSE" : "RESOLUTION";

  if (!deadline) {
    return {
      state: "ON_TRACK",
      firstResponseDueAt: ticket.firstResponseDueAt,
      resolutionDueAt: ticket.resolutionDueAt,
      msRemaining: null,
      elapsedRatio: 0,
      firstResponseMet,
      resolutionMet,
      nextDeadline: null,
    };
  }

  const start = ticket.createdAt.getTime();
  const total = Math.max(1, deadline.getTime() - start);
  const elapsed = now.getTime() - start;
  const elapsedRatio = elapsed / total;
  const msRemaining = deadline.getTime() - now.getTime();

  let state: SlaSnapshot["state"] = "ON_TRACK";
  if (msRemaining <= 0) state = "BREACHED";
  else if (elapsedRatio >= env.slaWarningThreshold) state = "AT_RISK";

  // A missed first-response deadline stays a breach even after we reply.
  if (firstResponseMet === false) state = "BREACHED";

  return {
    state,
    firstResponseDueAt: ticket.firstResponseDueAt,
    resolutionDueAt: ticket.resolutionDueAt,
    msRemaining,
    elapsedRatio: Number(elapsedRatio.toFixed(3)),
    firstResponseMet,
    resolutionMet,
    nextDeadline,
  };
}

/** Called the first time an agent-visible reply is sent on a ticket. */
export async function recordFirstResponse(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.firstResponseAt) return ticket;

  const now = new Date();
  const met = ticket.firstResponseDueAt ? now <= ticket.firstResponseDueAt : true;

  return prisma.ticket.update({
    where: { id: ticketId },
    data: { firstResponseAt: now, firstResponseMet: met },
  });
}

export async function recordResolution(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return null;

  const now = new Date();
  const met = ticket.resolutionDueAt ? now <= ticket.resolutionDueAt : true;

  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      resolvedAt: now,
      resolutionMet: met,
      slaState: met && ticket.firstResponseMet !== false ? "MET" : "BREACHED",
    },
  });
}

export interface ScanResult {
  scanned: number;
  warned: number;
  breached: number;
  escalated: number;
  ranAt: string;
}

/**
 * One pass of the SLA monitor. Safe to call from the timer or on demand from
 * the SLA Monitor page ("Run scan now").
 */
export async function runSlaScan(): Promise<ScanResult> {
  const now = new Date();
  const tickets = await prisma.ticket.findMany({
    where: { status: { in: OPEN_STATUSES } },
    include: { customer: { select: { name: true, tier: true } } },
  });

  const result: ScanResult = { scanned: tickets.length, warned: 0, breached: 0, escalated: 0, ranAt: now.toISOString() };

  for (const ticket of tickets) {
    const snapshot = computeSla(ticket, now);

    if (snapshot.state !== ticket.slaState) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { slaState: snapshot.state },
      });
    }

    if (snapshot.state === "AT_RISK" && !ticket.warningNotifiedAt) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { warningNotifiedAt: now } });
      await notify({
        type: "SLA_WARNING",
        title: `SLA at risk — #${ticket.number}`,
        body: `${Math.round((1 - snapshot.elapsedRatio) * 100)}% of the window left on "${ticket.subject}".`,
        ticketId: ticket.id,
      });
      await logEvent(ticket.id, "SLA_WARNING", `SLA warning threshold crossed on ${snapshot.nextDeadline?.replace("_", " ").toLowerCase()}`, {
        actorName: "SLA Monitor",
      });
      result.warned++;
    }

    if (snapshot.state === "BREACHED") {
      if (!ticket.breachNotifiedAt) {
        await prisma.ticket.update({ where: { id: ticket.id }, data: { breachNotifiedAt: now } });
        await notify({
          type: "SLA_BREACH",
          title: `SLA breached — #${ticket.number}`,
          body: `"${ticket.subject}" for ${ticket.customer.name} has passed its ${snapshot.nextDeadline?.replace("_", " ").toLowerCase()} deadline.`,
          ticketId: ticket.id,
        });
        await logEvent(ticket.id, "SLA_BREACH", "SLA deadline passed", { actorName: "SLA Monitor" });
        result.breached++;
      }

      // Auto-escalate once past the policy's grace period.
      const grace =
        (await prisma.slaPolicy.findFirst({ where: { priority: ticket.priority } }))?.escalateAfterMins ??
        DEFAULT_POLICIES[ticket.priority].escalateAfterMins;

      const overdueBy = snapshot.msRemaining !== null ? -snapshot.msRemaining : 0;

      if (!ticket.isEscalated && overdueBy >= minutes(grace)) {
        await escalateTicket(ticket.id, {
          trigger: "SLA_BREACH",
          reason: `SLA breached by ${Math.round(overdueBy / 60000)} minutes on a ${ticket.priority} ticket.`,
          actorName: "SLA Monitor",
        });
        result.escalated++;
      }
    }
  }

  if (result.warned || result.breached || result.escalated) {
    logger.info(
      "sla",
      `Scan: ${result.scanned} open · ${result.warned} warned · ${result.breached} breached · ${result.escalated} escalated`,
    );
  }

  return result;
}

let timer: NodeJS.Timeout | null = null;

export function startSlaMonitor() {
  if (timer) return;
  const intervalMs = Math.max(15, env.slaScanIntervalSeconds) * 1000;

  timer = setInterval(() => {
    runSlaScan().catch((error) => logger.error("sla", "Scan failed", error));
  }, intervalMs);

  // Don't keep the process alive purely for the scanner.
  timer.unref?.();
  logger.success("sla", `Monitor running every ${env.slaScanIntervalSeconds}s`);
}

export function stopSlaMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}
