export type Role = "ADMIN" | "MANAGER" | "AGENT";
export type Tier = "DIAMOND" | "PLATINUM" | "GOLD" | "SILVER" | "NEW";
export type Channel = "EMAIL" | "CHAT" | "INSTAGRAM" | "PHONE" | "WEB_FORM" | "SMS";
export type TicketStatus =
  | "NEW" | "TRIAGED" | "IN_PROGRESS" | "WAITING_ON_CUSTOMER" | "ESCALATED" | "RESOLVED" | "CLOSED";
export type Priority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";
export type Category =
  | "BOOKING" | "CANCELLATION" | "REFUND" | "COMPLAINT" | "SERVICE_QUESTION" | "PRODUCT_QUESTION"
  | "AFTERCARE" | "PRICING" | "GIFT_CARD" | "MEMBERSHIP" | "FEEDBACK" | "OTHER";
export type Sentiment = "DELIGHTED" | "POSITIVE" | "NEUTRAL" | "FRUSTRATED" | "ANGRY";
export type SlaState = "ON_TRACK" | "AT_RISK" | "BREACHED" | "MET";
export type DraftStatus = "PENDING" | "APPROVED" | "EDITED" | "REJECTED";
export type EscalationLevel = "L1_SENIOR_AGENT" | "L2_SHIFT_MANAGER" | "L3_SALON_DIRECTOR";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  title: string | null;
  avatarHue: number;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  tier: Tier;
  notes: string | null;
  tags: string[];
  totalVisits: number;
  lifetimeValue: number;
  preferredTech: string | null;
  allergies: string | null;
  lastVisitAt: string | null;
  joinedAt: string;
  _count?: { tickets: number };
  tickets?: Ticket[];
}

export interface Sla {
  state: SlaState;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  msRemaining: number | null;
  elapsedRatio: number;
  firstResponseMet: boolean | null;
  resolutionMet: boolean | null;
  nextDeadline: "FIRST_RESPONSE" | "RESOLUTION" | null;
}

export interface Message {
  id: string;
  authorType: "CUSTOMER" | "AGENT" | "AI" | "SYSTEM";
  authorName: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface Citation {
  articleId: string;
  chunkId: string;
  title: string;
  category: string;
  snippet: string;
  score: number;
}

export interface ReplyDraft {
  id: string;
  ticketId: string;
  body: string;
  finalBody: string | null;
  status: DraftStatus;
  confidence: number;
  tone: string;
  model: string;
  generatedBy: string;
  citations: Citation[];
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  approvedBy?: { name: string } | null;
  ticket?: Ticket;
}

export interface Escalation {
  id: string;
  ticketId: string;
  level: EscalationLevel;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  reason: string;
  trigger: string;
  slackSent: boolean;
  acknowledgedBy: string | null;
  triggeredAt: string;
  resolvedAt: string | null;
  ticket?: Ticket;
}

export interface TicketEvent {
  id: string;
  type: string;
  message: string;
  actorName: string;
  createdAt: string;
  ticket?: { number: number; subject: string };
}

export interface Ticket {
  id: string;
  number: number;
  subject: string;
  channel: Channel;
  status: TicketStatus;
  priority: Priority;
  category: Category;
  sentiment: Sentiment;
  sentimentScore: number;
  triagedByAi: boolean;
  aiConfidence: number | null;
  aiSummary: string | null;
  aiIntent: string | null;
  aiReasoning: string | null;
  aiSuggestedTags: string[];
  tags: string[];
  customerId: string;
  customer: Customer;
  assigneeId: string | null;
  assignee: { id?: string; name: string; avatarHue: number; title?: string | null } | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  slaState: SlaState;
  isEscalated: boolean;
  csatScore: number | null;
  createdAt: string;
  sla: Sla;
  messages?: Message[];
  drafts?: ReplyDraft[];
  escalations?: Escalation[];
  events?: TicketEvent[];
  slaPolicy?: SlaPolicy | null;
  _count?: { messages: number; drafts: number };
}

export interface SlaPolicy {
  id: string;
  name: string;
  priority: Priority;
  firstResponseMins: number;
  resolutionMins: number;
  escalateAfterMins: number;
  active: boolean;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  slug: string;
  category: string;
  content: string;
  summary: string | null;
  tags: string[];
  published: boolean;
  views: number;
  useCount: number;
  updatedAt: string;
  _count?: { chunks: number };
  chunks?: { id: string; ordinal: number; content: string; dims: number }[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  ticket: { id: string; number: number; subject: string } | null;
}

export interface SlackAlert {
  id: string;
  channel: string;
  title: string;
  text: string;
  status: "SENT" | "SIMULATED" | "FAILED";
  error: string | null;
  ticketNumber: number | null;
  payload: unknown;
  createdAt: string;
}

export interface Overview {
  openTickets: number;
  newToday: number;
  resolvedToday: number;
  unassigned: number;
  urgent: number;
  atRisk: number;
  breached: number;
  escalationsOpen: number;
  pendingDrafts: number;
  avgFirstResponseMins: number;
  avgResolutionMins: number;
  slaComplianceRate: number;
  avgCsat: number | null;
  aiTriageRate: number;
  avgAiConfidence: number;
  negativeSentiment: number;
  totalCustomers: number;
  publishedArticles: number;
}

export interface TriageResult {
  category: Category;
  priority: Priority;
  sentiment: Sentiment;
  sentimentScore: number;
  intent: string;
  summary: string;
  tags: string[];
  confidence: number;
  reasoning: string;
  escalationRecommended: boolean;
  engine: "claude" | "demo";
  model: string;
}

export interface RuntimeConfig {
  demoMode: boolean;
  aiProvider: string;
  aiModel: string;
  aiEffort: string;
  slackConfigured: boolean;
  slackChannel: string;
  ragTopK: number;
  slaWarningThreshold: number;
  slaScanIntervalSeconds: number;
}
