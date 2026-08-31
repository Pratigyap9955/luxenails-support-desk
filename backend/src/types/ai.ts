import type { Category, Priority, Sentiment } from "@prisma/client";

export interface TriageInput {
  subject: string;
  body: string;
  channel: string;
  customer: {
    name: string;
    tier: string;
    totalVisits: number;
    lifetimeValue: number;
    lastVisitAt?: Date | null;
  };
  history?: { authorType: string; body: string }[];
}

export interface TriageResult {
  category: Category;
  priority: Priority;
  sentiment: Sentiment;
  /** -1 (furious) .. +1 (delighted) */
  sentimentScore: number;
  intent: string;
  summary: string;
  tags: string[];
  /** 0..1 */
  confidence: number;
  reasoning: string;
  escalationRecommended: boolean;
  engine: "claude" | "demo";
  model: string;
}

export interface RagCitation {
  articleId: string;
  chunkId: string;
  title: string;
  category: string;
  snippet: string;
  score: number;
}

export interface DraftInput {
  ticket: {
    number: number;
    subject: string;
    category: Category;
    priority: Priority;
    sentiment: Sentiment;
    channel: string;
  };
  customer: { name: string; tier: string; totalVisits: number; preferredTech?: string | null };
  conversation: { authorType: string; authorName: string; body: string }[];
  citations: RagCitation[];
  agentName: string;
  tone?: string;
}

export interface DraftResult {
  body: string;
  confidence: number;
  tone: string;
  engine: "claude" | "demo";
  model: string;
}
