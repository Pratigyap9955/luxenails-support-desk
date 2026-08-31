/**
 * Slack alerts.
 *
 * Every alert is persisted to the SlackAlert table regardless of delivery, so
 * the Escalations page can show a real outbox. In Demo Mode (or with no webhook
 * configured) the alert is recorded as SIMULATED instead of being posted — the
 * workflow is identical, only the network call is skipped.
 */

import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import type { Priority, Ticket } from "@prisma/client";

const PRIORITY_EMOJI: Record<Priority, string> = {
  URGENT: "🚨",
  HIGH: "🔴",
  MEDIUM: "🟡",
  LOW: "🟢",
};

export interface SlackAlertInput {
  title: string;
  text: string;
  ticketNumber?: number;
  fields?: Record<string, string>;
  priority?: Priority;
}

/** Slack Block Kit payload — what would be POSTed to the webhook. */
function buildPayload(input: SlackAlertInput) {
  const emoji = input.priority ? PRIORITY_EMOJI[input.priority] : "💅";
  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${emoji} ${input.title}`, emoji: true },
    },
    { type: "section", text: { type: "mrkdwn", text: input.text } },
  ];

  if (input.fields && Object.keys(input.fields).length > 0) {
    blocks.push({
      type: "section",
      fields: Object.entries(input.fields).map(([key, value]) => ({
        type: "mrkdwn",
        text: `*${key}*\n${value}`,
      })),
    });
  }

  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `LUXENAILS Support Desk · ${new Date().toLocaleString("en-GB")}` },
    ],
  });

  return { channel: env.slackChannel, text: `${input.title} — ${input.text}`, blocks };
}

export async function sendSlackAlert(input: SlackAlertInput) {
  const payload = buildPayload(input);
  const live = !env.demoMode && env.slackWebhookUrl.length > 0;

  if (!live) {
    logger.info("slack", `[simulated] ${input.title}`);
    return prisma.slackAlert.create({
      data: {
        channel: env.slackChannel,
        title: input.title,
        text: input.text,
        payload: payload as object,
        status: "SIMULATED",
        ticketNumber: input.ticketNumber ?? null,
      },
    });
  }

  try {
    const response = await fetch(env.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`Slack responded ${response.status}: ${await response.text()}`);

    logger.success("slack", `Posted "${input.title}" to ${env.slackChannel}`);
    return prisma.slackAlert.create({
      data: {
        channel: env.slackChannel,
        title: input.title,
        text: input.text,
        payload: payload as object,
        status: "SENT",
        ticketNumber: input.ticketNumber ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("slack", `Delivery failed — ${message}`);
    return prisma.slackAlert.create({
      data: {
        channel: env.slackChannel,
        title: input.title,
        text: input.text,
        payload: payload as object,
        status: "FAILED",
        error: message,
        ticketNumber: input.ticketNumber ?? null,
      },
    });
  }
}

/** Convenience wrapper used by the escalation flow. */
export async function alertEscalation(
  ticket: Pick<Ticket, "number" | "subject" | "priority" | "category" | "sentiment">,
  reason: string,
  level: string,
  customerName: string,
) {
  return sendSlackAlert({
    title: `Escalation — Ticket #${ticket.number}`,
    text: `*${ticket.subject}*\n${reason}`,
    priority: ticket.priority,
    ticketNumber: ticket.number,
    fields: {
      Customer: customerName,
      Level: level.replace(/_/g, " "),
      Priority: ticket.priority,
      Category: ticket.category.replace(/_/g, " "),
      Sentiment: ticket.sentiment,
    },
  });
}
