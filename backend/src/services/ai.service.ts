/**
 * AI service — Anthropic Claude with a guaranteed local fallback.
 *
 * Contract: these functions never throw and never block a workflow. If Claude is
 * unavailable (no key, rate limit, refusal, network) the Demo Engine answers
 * instead and the result is tagged `engine: "demo"` so the UI can say so.
 */

import Anthropic from "@anthropic-ai/sdk";
// The SDK's structured-output helper is built against Zod v4; the rest of the
// backend validates requests with the classic v3 API from the same package.
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { demoDraftReply, demoTriage } from "./demo-engine";
import type { DraftInput, DraftResult, TriageInput, TriageResult } from "../types/ai";

let client: Anthropic | null = null;

/** True when a real Claude call should be attempted. */
export function isAiLive(): boolean {
  return !env.demoMode && env.anthropicApiKey.length > 0;
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "invalid ANTHROPIC_API_KEY";
  if (error instanceof Anthropic.RateLimitError) return "rate limited";
  if (error instanceof Anthropic.BadRequestError) return `bad request: ${error.message}`;
  if (error instanceof Anthropic.APIConnectionError) return "connection failed";
  if (error instanceof Anthropic.APIError) return `API error ${error.status}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

// ───────────────────────────── Triage ─────────────────────────────

const TriageSchema = z.object({
  category: z.enum([
    "BOOKING", "CANCELLATION", "REFUND", "COMPLAINT", "SERVICE_QUESTION",
    "PRODUCT_QUESTION", "AFTERCARE", "PRICING", "GIFT_CARD", "MEMBERSHIP",
    "FEEDBACK", "OTHER",
  ]),
  priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]),
  sentiment: z.enum(["DELIGHTED", "POSITIVE", "NEUTRAL", "FRUSTRATED", "ANGRY"]),
  sentiment_score: z.number().min(-1).max(1),
  intent: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  escalation_recommended: z.boolean(),
});

const TRIAGE_SYSTEM = `You are the triage engine for LUXENAILS, a premium nail salon in Mayfair, London.

You classify inbound customer messages for a support desk. Be decisive and consistent.

Priority rubric — apply in order, highest match wins:
- URGENT: physical harm, infection, allergic reaction, chemical burn, legal or regulatory threat, chargeback filed, or an event within 24 hours that we caused to fail.
- HIGH: money is wrong (refund, double charge), a booking today or tomorrow is at risk, an angry Diamond/Platinum member, or a repeat contact about an unresolved issue.
- MEDIUM: a standard request needing action within a day or two.
- LOW: general curiosity, praise, or anything with no deadline.

Sentiment is the customer's emotional state, not the topic. A polite refund request is NEUTRAL. Score it from -1 (furious) to +1 (delighted).

Rules:
- "summary" is one sentence an agent can read in two seconds. No preamble.
- "intent" is the customer's goal in under 10 words.
- "tags" are 2-5 lowercase kebab-case labels useful for filtering.
- "reasoning" is one or two sentences naming the specific signals you used.
- "confidence" is your genuine certainty in the category and priority.
- Set "escalation_recommended" only when a manager must personally intervene.`;

function buildTriagePrompt(input: TriageInput): string {
  const history = input.history?.length
    ? `\n\nEarlier in this thread:\n${input.history
        .slice(-4)
        .map((m) => `[${m.authorType}] ${m.body.slice(0, 400)}`)
        .join("\n")}`
    : "";

  const lastVisit = input.customer.lastVisitAt
    ? new Date(input.customer.lastVisitAt).toISOString().slice(0, 10)
    : "never";

  return `Customer: ${input.customer.name}
Loyalty tier: ${input.customer.tier}
Lifetime visits: ${input.customer.totalVisits} | Lifetime value: £${input.customer.lifetimeValue.toFixed(0)} | Last visit: ${lastVisit}
Channel: ${input.channel}

Subject: ${input.subject}

Message:
${input.body}${history}`;
}

export async function triageTicket(input: TriageInput): Promise<TriageResult> {
  if (!isAiLive()) return demoTriage(input);

  try {
    const response = await getClient().messages.parse({
      model: env.anthropicModel,
      max_tokens: 4000,
      system: [{ type: "text", text: TRIAGE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildTriagePrompt(input) }],
      output_config: {
        effort: env.aiEffort,
        format: zodOutputFormat(TriageSchema),
      },
    });

    if (response.stop_reason === "refusal") {
      logger.warn("ai", `Triage refused (${response.stop_details?.category ?? "unknown"}) — using demo engine`);
      return demoTriage(input);
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      logger.warn("ai", "Triage returned no parsable output — using demo engine");
      return demoTriage(input);
    }

    return {
      category: parsed.category,
      priority: parsed.priority,
      sentiment: parsed.sentiment,
      sentimentScore: parsed.sentiment_score,
      intent: parsed.intent,
      summary: parsed.summary,
      tags: parsed.tags.slice(0, 6).map((t) => t.toLowerCase().replace(/\s+/g, "-")),
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      escalationRecommended: parsed.escalation_recommended,
      engine: "claude",
      model: env.anthropicModel,
    };
  } catch (error) {
    logger.warn("ai", `Triage fell back to demo engine — ${describeError(error)}`);
    return demoTriage(input);
  }
}

// ────────────────────────── Reply drafting ──────────────────────────

const REPLY_SYSTEM = `You are a senior client care agent at LUXENAILS, a premium nail salon in Mayfair, London. You draft replies for a human agent to review before sending.

Voice: warm, composed, quietly luxurious. Never gushing, never corporate. Short paragraphs.

Hard rules:
- Ground every factual claim about policy, pricing, or timings in the KNOWLEDGE BASE passages provided. If the passages do not cover something, say what you will find out rather than inventing it.
- Never invent prices, dates, staff names, or appointment slots.
- Open by acknowledging what the customer actually said. Apologise once, specifically, and only when we got something wrong.
- Close with one clear next step or one clear question.
- Sign off with the agent's name and "LUXENAILS Client Care".
- Output only the reply body. No subject line, no preamble, no markdown headings, no placeholders like [name].`;

function buildReplyPrompt(input: DraftInput): string {
  const kb = input.citations.length
    ? input.citations
        .map((c, i) => `[${i + 1}] ${c.title} (${c.category})\n${c.snippet}`)
        .join("\n\n")
    : "No relevant knowledge base passages were retrieved. Do not state any policy specifics.";

  const conversation = input.conversation
    .map((m) => `${m.authorType === "CUSTOMER" ? "CUSTOMER" : m.authorName}: ${m.body}`)
    .join("\n\n");

  return `KNOWLEDGE BASE
${kb}

CUSTOMER
Name: ${input.customer.name} | Tier: ${input.customer.tier} | Visits: ${input.customer.totalVisits}${
    input.customer.preferredTech ? ` | Preferred technician: ${input.customer.preferredTech}` : ""
  }

TICKET #${input.ticket.number} — ${input.ticket.subject}
Category: ${input.ticket.category} | Priority: ${input.ticket.priority} | Sentiment: ${input.ticket.sentiment} | Channel: ${input.ticket.channel}

CONVERSATION
${conversation}

Draft the reply. Sign it as ${input.agentName}.`;
}

export async function draftReply(input: DraftInput): Promise<DraftResult> {
  if (!isAiLive()) return demoDraftReply(input);

  try {
    const response = await getClient().messages.create({
      model: env.anthropicModel,
      max_tokens: 4000,
      system: [{ type: "text", text: REPLY_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildReplyPrompt(input) }],
      output_config: { effort: env.aiEffort },
    });

    if (response.stop_reason === "refusal") {
      logger.warn("ai", "Reply draft refused — using demo engine");
      return demoDraftReply(input);
    }

    const body = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!body) return demoDraftReply(input);

    // Retrieval quality caps how much we trust a grounded reply.
    const retrievalScore = input.citations.length
      ? input.citations.reduce((acc, c) => acc + c.score, 0) / input.citations.length
      : 0;
    const confidence = Number(Math.max(0.4, Math.min(0.97, 0.55 + retrievalScore * 0.45)).toFixed(2));

    return {
      body,
      confidence,
      tone: input.tone ?? "warm-professional",
      engine: "claude",
      model: env.anthropicModel,
    };
  } catch (error) {
    logger.warn("ai", `Reply draft fell back to demo engine — ${describeError(error)}`);
    return demoDraftReply(input);
  }
}

/** Verifies credentials with a minimal request. Used by the Settings page. */
export async function testAiConnection(): Promise<{ ok: boolean; message: string; model: string }> {
  if (!isAiLive()) {
    return {
      ok: true,
      message: env.anthropicApiKey
        ? "Demo Mode is on — set DEMO_MODE=false to use Claude."
        : "Demo Mode: no ANTHROPIC_API_KEY set. The local engine is handling all AI.",
      model: "luxenails-demo-v1",
    };
  }

  try {
    const response = await getClient().messages.create({
      model: env.anthropicModel,
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
    });
    const text = response.content.find((b) => b.type === "text");
    return {
      ok: true,
      message: `Connected to ${env.anthropicModel}. Response: "${text?.type === "text" ? text.text.trim() : "ok"}"`,
      model: env.anthropicModel,
    };
  } catch (error) {
    return { ok: false, message: describeError(error), model: env.anthropicModel };
  }
}
