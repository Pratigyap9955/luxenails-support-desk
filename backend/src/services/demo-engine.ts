/**
 * Demo Engine — the offline half of the AI layer.
 *
 * Every AI capability in this product has two implementations: a Claude call and
 * a deterministic local one. This file is the local one. It is not a stub: it
 * runs weighted keyword scoring for classification, a lexicon for sentiment, and
 * composes replies from the same RAG passages Claude would receive. That keeps
 * the full workflow — triage, retrieval, drafting, approval, SLA, escalation —
 * demonstrable with zero credentials.
 */

import type { Category, Priority, Sentiment } from "@prisma/client";
import type { DraftInput, DraftResult, TriageInput, TriageResult } from "../types/ai";
import { tokenize } from "./embedding.service";

const DEMO_MODEL = "luxenails-demo-v1";

// ───────────────────────── Classification ─────────────────────────

/** Weighted signals per category. Multi-word phrases score higher than single terms. */
const CATEGORY_SIGNALS: Record<Category, { term: string; weight: number }[]> = {
  BOOKING: [
    { term: "book", weight: 3 }, { term: "appointment", weight: 3 }, { term: "reschedule", weight: 4 },
    { term: "availability", weight: 3 }, { term: "slot", weight: 2 }, { term: "reserve", weight: 3 },
    { term: "schedule", weight: 3 }, { term: "walk in", weight: 3 }, { term: "double booked", weight: 4 },
    { term: "move my", weight: 5 }, { term: "moving", weight: 3 }, { term: "move the", weight: 4 },
    { term: "another day", weight: 4 }, { term: "different day", weight: 4 }, { term: "swap", weight: 3 },
    { term: "change my appointment", weight: 5 }, { term: "short notice", weight: 2 },
  ],
  CANCELLATION: [
    { term: "cancel", weight: 5 }, { term: "cancellation", weight: 5 }, { term: "no show", weight: 4 },
    { term: "cant make", weight: 3 }, { term: "cannot make", weight: 3 }, { term: "late fee", weight: 3 },
  ],
  REFUND: [
    { term: "refund", weight: 6 }, { term: "money back", weight: 5 }, { term: "charged", weight: 3 },
    { term: "overcharged", weight: 5 }, { term: "double charged", weight: 5 }, { term: "reimburse", weight: 4 },
    { term: "chargeback", weight: 5 }, { term: "billing", weight: 3 },
  ],
  COMPLAINT: [
    { term: "complaint", weight: 5 }, { term: "disappointed", weight: 4 }, { term: "unacceptable", weight: 5 },
    { term: "ruined", weight: 5 }, { term: "chipped", weight: 5 }, { term: "lifted", weight: 5 },
    { term: "peeling", weight: 4 }, { term: "broke", weight: 3 }, { term: "rude", weight: 5 },
    { term: "terrible", weight: 4 }, { term: "awful", weight: 4 }, { term: "infection", weight: 6 },
    { term: "burn", weight: 5 }, { term: "damaged", weight: 4 },
    // Skin reactions are complaints, not product questions — and they outrank
    // the incidental "booked"/"appointment" wording such messages always contain.
    { term: "reaction", weight: 7 }, { term: "allergic", weight: 7 }, { term: "swollen", weight: 6 },
    { term: "itching", weight: 5 }, { term: "irritation", weight: 5 }, { term: "rash", weight: 6 },
    { term: "weeping", weight: 6 }, { term: "bleeding", weight: 7 }, { term: "painful", weight: 4 },
    { term: "sore", weight: 3 }, { term: "snapped", weight: 4 }, { term: "fell off", weight: 4 },
  ],
  SERVICE_QUESTION: [
    { term: "how long", weight: 3 }, { term: "what is", weight: 2 }, { term: "difference between", weight: 4 },
    // Treatment names appear in almost every message, so they are weak evidence
    // on their own — what makes it a question is the asking.
    { term: "gel", weight: 1 }, { term: "acrylic", weight: 1 }, { term: "biab", weight: 2 },
    { term: "extension", weight: 1 }, { term: "pedicure", weight: 1 }, { term: "manicure", weight: 1 },
    { term: "nail art", weight: 2 }, { term: "soak off", weight: 3 }, { term: "do you offer", weight: 4 },
    { term: "thinking of", weight: 3 }, { term: "should i", weight: 3 }, { term: "would you recommend", weight: 4 },
  ],
  PRODUCT_QUESTION: [
    { term: "product", weight: 3 }, { term: "polish", weight: 2 }, { term: "brand", weight: 3 },
    { term: "vegan", weight: 4 }, { term: "cruelty free", weight: 4 }, { term: "ingredient", weight: 4 },
    { term: "non toxic", weight: 4 }, { term: "10 free", weight: 4 }, { term: "cuticle oil", weight: 3 },
  ],
  AFTERCARE: [
    { term: "aftercare", weight: 5 }, { term: "how do i care", weight: 4 }, { term: "last longer", weight: 4 },
    { term: "maintain", weight: 3 }, { term: "swimming", weight: 3 }, { term: "shower", weight: 2 },
    { term: "remove at home", weight: 4 }, { term: "fill", weight: 2 }, { term: "infill", weight: 3 },
    { term: "look after", weight: 5 }, { term: "care for", weight: 4 }, { term: "keep it looking", weight: 4 },
    { term: "cuticle oil", weight: 3 }, { term: "come back", weight: 2 }, { term: "swim", weight: 3 },
  ],
  PRICING: [
    { term: "price", weight: 4 }, { term: "cost", weight: 4 }, { term: "how much", weight: 5 },
    { term: "quote", weight: 3 }, { term: "deposit", weight: 3 }, { term: "surcharge", weight: 3 },
    { term: "rate", weight: 2 },
  ],
  GIFT_CARD: [
    { term: "gift card", weight: 6 }, { term: "voucher", weight: 5 }, { term: "gift voucher", weight: 6 },
    { term: "redeem", weight: 4 }, { term: "balance", weight: 3 }, { term: "expired card", weight: 4 },
  ],
  MEMBERSHIP: [
    { term: "membership", weight: 6 }, { term: "subscription", weight: 5 }, { term: "loyalty", weight: 4 },
    { term: "member", weight: 3 }, { term: "points", weight: 3 }, { term: "vip", weight: 3 },
    { term: "renew", weight: 3 }, { term: "tier", weight: 2 },
  ],
  FEEDBACK: [
    // "thank you" is ordinary politeness and appears in most messages, so it
    // carries little weight on its own; praise that names the experience does.
    { term: "thank you", weight: 1 }, { term: "amazing", weight: 3 }, { term: "love", weight: 3 },
    { term: "compliment", weight: 4 }, { term: "review", weight: 3 }, { term: "shout out", weight: 5 },
    { term: "obsessed", weight: 4 }, { term: "wanted to say", weight: 5 }, { term: "pass this on", weight: 5 },
    { term: "made my day", weight: 4 }, { term: "so lovely", weight: 3 },
  ],
  OTHER: [],
};

const POSITIVE_LEXICON = new Set([
  // "happy" is excluded on purpose: in support text it is nearly always
  // "happy to send a screenshot" — willingness, not delight.
  "amazing","love","loved","perfect","wonderful","beautiful","gorgeous","thank","thanks","great",
  "excellent","obsessed","delighted","fantastic","best","pleased","stunning","flawless","incredible",
]);

const NEGATIVE_LEXICON = new Set([
  "angry","furious","upset","disappointed","terrible","awful","horrible","unacceptable","ruined",
  "worst","never","refuse","complaint","disgusting","rude","ignored","embarrassing","frustrated",
  "frustrating","annoyed","waste","damaged","painful","hurt","infection","burn","poor","bad","wrong",
  // Physical-symptom words only. Generic worry ("worried it won't last") is
  // deliberation about a purchase, not distress, and misreads as frustration.
  "swollen","infected","itching","weeping","raw","sore","reaction",
]);

const INTENSIFIERS = new Set(["very", "extremely", "absolutely", "completely", "utterly", "so", "really"]);

const URGENT_SIGNALS = [
  "infection", "bleeding", "allergic", "burn", "swollen", "emergency", "legal", "lawyer",
  "wedding tomorrow", "wedding today", "trading standards", "health department", "chargeback",
];

const HIGH_SIGNALS = [
  "refund", "cancel", "today", "tomorrow", "asap", "urgent", "immediately", "double charged",
  "overcharged", "complaint", "manager", "unacceptable", "still waiting", "second time",
];

function normalizeText(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreCategory(text: string): { category: Category; score: number; runnerUp: number } {
  const scores = new Map<Category, number>();

  for (const [category, signals] of Object.entries(CATEGORY_SIGNALS) as [Category, typeof CATEGORY_SIGNALS[Category]][]) {
    let total = 0;
    for (const { term, weight } of signals) {
      if (text.includes(term)) total += weight;
    }
    if (total > 0) scores.set(category, total);
  }

  if (scores.size === 0) return { category: "OTHER", score: 0, runnerUp: 0 };

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  return { category: ranked[0][0], score: ranked[0][1], runnerUp: ranked[1]?.[1] ?? 0 };
}

function scoreSentiment(text: string): { sentiment: Sentiment; score: number } {
  const words = text.split(" ");
  let score = 0;
  let hits = 0;

  words.forEach((word, index) => {
    const intensity = index > 0 && INTENSIFIERS.has(words[index - 1]) ? 1.6 : 1;
    const negated = index > 0 && ["not", "isnt", "wasnt", "didnt", "dont", "no"].includes(words[index - 1]);
    if (POSITIVE_LEXICON.has(word)) {
      score += (negated ? -1 : 1) * intensity;
      hits++;
    } else if (NEGATIVE_LEXICON.has(word)) {
      score -= (negated ? -1 : 1) * intensity;
      hits++;
    }
  });

  // Shouting and pile-on punctuation are strong frustration signals.
  const exclamations = (text.match(/!/g) ?? []).length;
  if (exclamations >= 2) score -= 0.5;

  const normalized = hits === 0 ? 0 : Math.max(-1, Math.min(1, score / Math.max(2, hits)));

  let sentiment: Sentiment = "NEUTRAL";
  if (normalized >= 0.55) sentiment = "DELIGHTED";
  else if (normalized >= 0.2) sentiment = "POSITIVE";
  else if (normalized <= -0.6) sentiment = "ANGRY";
  else if (normalized <= -0.2) sentiment = "FRUSTRATED";

  return { sentiment, score: Number(normalized.toFixed(2)) };
}

function scorePriority(
  text: string,
  sentiment: Sentiment,
  category: Category,
  tier: string,
): { priority: Priority; drivers: string[] } {
  const drivers: string[] = [];

  // Anything that asks us to do something starts at MEDIUM. LOW is reserved for
  // messages with nothing pending — praise, or an FYI. Without this baseline a
  // routine booking request scores the same as a thank-you note.
  let weight = category === "FEEDBACK" ? 0 : 1.5;

  for (const signal of URGENT_SIGNALS) {
    if (text.includes(signal)) {
      weight += 5;
      drivers.push(`safety/legal signal "${signal}"`);
    }
  }
  for (const signal of HIGH_SIGNALS) {
    if (text.includes(signal)) {
      weight += 2;
      drivers.push(`urgency signal "${signal}"`);
    }
  }

  if (sentiment === "ANGRY") {
    weight += 3;
    drivers.push("angry sentiment");
  } else if (sentiment === "FRUSTRATED") {
    weight += 1.5;
    drivers.push("frustrated sentiment");
  }

  if (["DIAMOND", "PLATINUM"].includes(tier)) {
    weight += 2;
    drivers.push(`${tier} tier customer`);
  } else if (tier === "GOLD") {
    weight += 1;
    drivers.push("GOLD tier customer");
  }

  if (category === "COMPLAINT" || category === "REFUND") {
    weight += 2;
    drivers.push(`${category.toLowerCase()} category`);
  }
  if (category === "FEEDBACK") {
    weight -= 2;
    drivers.push("positive feedback, no action pending");
  }

  // URGENT is deliberately hard to reach: it should mean harm, legal exposure or
  // a same-day failure, not simply a valuable customer with a billing error.
  let priority: Priority = "LOW";
  if (weight >= 8.5) priority = "URGENT";
  else if (weight >= 4) priority = "HIGH";
  else if (weight >= 1.5) priority = "MEDIUM";

  if (drivers.length === 0) drivers.push("no urgency markers detected");
  return { priority, drivers };
}

const INTENT_BY_CATEGORY: Record<Category, string> = {
  BOOKING: "Schedule, move, or confirm an appointment",
  CANCELLATION: "Cancel an appointment or dispute a cancellation charge",
  REFUND: "Recover money for a service or charge",
  COMPLAINT: "Report a service failure and seek remedy",
  SERVICE_QUESTION: "Understand what a treatment involves before booking",
  PRODUCT_QUESTION: "Check product brands, ingredients, or suitability",
  AFTERCARE: "Get guidance on maintaining nails between visits",
  PRICING: "Confirm the cost of a service or package",
  GIFT_CARD: "Buy, redeem, or check the balance of a gift card",
  MEMBERSHIP: "Manage a membership, loyalty tier, or renewal",
  FEEDBACK: "Share praise or a review of a recent visit",
  OTHER: "General enquiry requiring an agent to interpret",
};

/** Build a short extractive summary from the highest-signal sentence. */
function summarize(subject: string, body: string, category: Category): string {
  const sentences = body
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const signals = CATEGORY_SIGNALS[category].map((s) => s.term);
  let best = sentences[0] ?? subject;
  let bestScore = -1;

  for (const sentence of sentences.slice(0, 6)) {
    const lower = sentence.toLowerCase();
    let score = signals.reduce((acc, term) => acc + (lower.includes(term) ? 2 : 0), 0);
    score += Math.min(3, tokenize(sentence).length / 8);
    if (score > bestScore) {
      bestScore = score;
      best = sentence;
    }
  }

  const trimmed = best.length > 180 ? `${best.slice(0, 177).trimEnd()}…` : best;
  return `${subject.replace(/\s+/g, " ").trim()} — ${trimmed}`;
}

function buildTags(text: string, category: Category, sentiment: Sentiment, tier: string): string[] {
  const tags = new Set<string>([category.toLowerCase().replace(/_/g, "-")]);
  if (sentiment === "ANGRY" || sentiment === "FRUSTRATED") tags.add("at-risk");
  if (sentiment === "DELIGHTED") tags.add("promoter");
  if (["DIAMOND", "PLATINUM"].includes(tier)) tags.add("vip");
  if (text.includes("wedding") || text.includes("bridal")) tags.add("bridal");
  if (text.includes("gel")) tags.add("gel");
  if (text.includes("acrylic")) tags.add("acrylic");
  if (text.includes("pedicure")) tags.add("pedicure");
  if (URGENT_SIGNALS.some((s) => text.includes(s))) tags.add("safety");
  if (text.includes("refund") || text.includes("charged")) tags.add("billing");
  return [...tags].slice(0, 6);
}

export function demoTriage(input: TriageInput): TriageResult {
  const raw = `${input.subject}\n${input.body}`;
  const text = normalizeText(raw);

  const { category, score, runnerUp } = scoreCategory(text);
  const { sentiment, score: sentimentScore } = scoreSentiment(text);
  const { priority, drivers } = scorePriority(text, sentiment, category, input.customer.tier);

  // Confidence reflects both absolute signal strength and margin over runner-up.
  const margin = score === 0 ? 0 : (score - runnerUp) / score;
  const confidence = Math.max(
    0.35,
    Math.min(0.96, 0.4 + Math.min(0.3, score / 20) + margin * 0.3),
  );

  const escalationRecommended =
    priority === "URGENT" ||
    sentiment === "ANGRY" ||
    (["DIAMOND", "PLATINUM"].includes(input.customer.tier) && priority === "HIGH");

  return {
    category,
    priority,
    sentiment,
    sentimentScore,
    intent: INTENT_BY_CATEGORY[category],
    summary: summarize(input.subject, input.body, category),
    tags: buildTags(text, category, sentiment, input.customer.tier),
    confidence: Number(confidence.toFixed(2)),
    reasoning: `Matched ${category} on keyword weight ${score.toFixed(0)} (runner-up ${runnerUp.toFixed(0)}). Sentiment ${sentiment} at ${sentimentScore}. Priority ${priority} driven by: ${drivers.slice(0, 4).join("; ")}.`,
    escalationRecommended,
    engine: "demo",
    model: DEMO_MODEL,
  };
}

// ─────────────────────────── Reply drafting ───────────────────────────

const OPENERS: Record<Sentiment, (name: string) => string> = {
  ANGRY: (n) => `Hi ${n}, thank you for telling us — I'm genuinely sorry, this is not the standard LUXENAILS holds itself to and I want to put it right for you today.`,
  FRUSTRATED: (n) => `Hi ${n}, thank you for flagging this, and I'm sorry for the frustration. Let me sort it out for you.`,
  NEUTRAL: (n) => `Hi ${n}, thank you for getting in touch with LUXENAILS.`,
  POSITIVE: (n) => `Hi ${n}, lovely to hear from you — thank you for reaching out.`,
  DELIGHTED: (n) => `Hi ${n}, what a joy to read this — thank you so much for taking the time to share it.`,
};

const NEXT_STEPS: Record<Category, string> = {
  BOOKING: "If you let me know your preferred day and whether mornings or evenings suit you better, I'll hold the slot under your name straight away.",
  CANCELLATION: "Just confirm you'd like me to go ahead and I'll process the cancellation and send you written confirmation within the hour.",
  REFUND: "I've flagged this to our billing lead. If you can confirm the last four digits of the card used, I'll have the refund raised today — it typically clears in 3–5 working days.",
  COMPLAINT: "I'd like to book you in with our senior technician for a complimentary correction at a time that suits you. Would this week or next work better?",
  SERVICE_QUESTION: "If you tell me a little about your nail length and lifestyle, I can recommend the treatment that will wear best for you.",
  PRODUCT_QUESTION: "Happy to send over the full ingredient list for anything you're considering — just say the word.",
  AFTERCARE: "Follow those steps and your set should stay flawless until your next visit. Send me a photo any time if something doesn't look right.",
  PRICING: "If you'd like, I can put together a bundled quote for the combination you're considering — it usually works out better value than booking separately.",
  GIFT_CARD: "Let me know the recipient's name and the amount, and I'll have a card issued and emailed within minutes.",
  MEMBERSHIP: "Confirm which option you'd like and I'll update your membership from your next billing date, with nothing to pay in the meantime.",
  FEEDBACK: "I've passed this straight to the team — it genuinely makes their day. We'll see you at your next visit.",
  OTHER: "Let me know a little more detail and I'll make sure this gets to exactly the right person on our team.",
};

const TIER_TOUCH: Record<string, string> = {
  DIAMOND: "As one of our Diamond members, your request goes straight to the front of our queue.",
  PLATINUM: "As a Platinum member, you also have priority rebooking whenever you need it.",
  GOLD: "As a Gold member, your loyalty rate is already applied to anything we arrange.",
};

/**
 * Compose a reply from the retrieved knowledge-base passages. The passages are
 * the same ones Claude would be grounded on, so citations stay honest.
 */
export function demoDraftReply(input: DraftInput): DraftResult {
  const firstName = input.customer.name.split(" ")[0] ?? input.customer.name;
  const parts: string[] = [OPENERS[input.ticket.sentiment](firstName)];

  if (input.citations.length > 0) {
    const grounded = input.citations
      .slice(0, 2)
      .map((c) => {
        const sentence = c.snippet
          .replace(/\s+/g, " ")
          .split(/(?<=[.!?])\s+/)
          .filter((s) => s.trim().length > 25)
          .slice(0, 2)
          .join(" ")
          .trim();
        return sentence || c.snippet.slice(0, 200);
      })
      .join(" ");
    parts.push(`Here's how it works on our side: ${grounded}`);
  } else {
    parts.push(
      "I've had a look at your account and I want to make sure I give you an accurate answer rather than a quick one.",
    );
  }

  const tierLine = TIER_TOUCH[input.customer.tier];
  if (tierLine) parts.push(tierLine);

  parts.push(NEXT_STEPS[input.ticket.category]);
  parts.push(`Warmly,\n${input.agentName}\nLUXENAILS Client Care`);

  // Confidence tracks retrieval quality — an ungrounded draft says so.
  const retrievalScore = input.citations.length
    ? input.citations.reduce((acc, c) => acc + c.score, 0) / input.citations.length
    : 0;
  const confidence = Math.max(0.32, Math.min(0.9, 0.35 + retrievalScore * 0.9));

  return {
    body: parts.join("\n\n"),
    confidence: Number(confidence.toFixed(2)),
    tone: input.tone ?? (input.ticket.sentiment === "ANGRY" ? "apologetic-urgent" : "warm-professional"),
    engine: "demo",
    model: DEMO_MODEL,
  };
}
