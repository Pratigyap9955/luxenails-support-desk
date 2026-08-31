/** Visual vocabulary for every enum the API returns. One source of truth. */

import type { Category, Channel, Priority, Sentiment, SlaState, TicketStatus, Tier } from "./types";

export const PRIORITY_STYLE: Record<Priority, { chip: string; dot: string; label: string }> = {
  URGENT: { chip: "bg-rose-500 text-white border-rose-500", dot: "bg-rose-500", label: "Urgent" },
  HIGH: { chip: "bg-blush-200 text-plum-800 border-blush-300", dot: "bg-rose-400", label: "High" },
  MEDIUM: { chip: "bg-gold-300/40 text-plum-700 border-gold-300", dot: "bg-gold-400", label: "Medium" },
  LOW: { chip: "bg-cream-300 text-ink-600 border-cream-300", dot: "bg-ink-400", label: "Low" },
};

export const STATUS_STYLE: Record<TicketStatus, { chip: string; label: string }> = {
  NEW: { chip: "bg-blush-100 text-plum-700 border-blush-200", label: "New" },
  TRIAGED: { chip: "bg-cream-200 text-ink-600 border-cream-300", label: "Triaged" },
  IN_PROGRESS: { chip: "bg-plum-500/10 text-plum-700 border-plum-500/20", label: "In progress" },
  WAITING_ON_CUSTOMER: { chip: "bg-gold-300/25 text-plum-700 border-gold-300/60", label: "Waiting on customer" },
  ESCALATED: { chip: "bg-rose-500/12 text-rose-600 border-rose-400/40", label: "Escalated" },
  RESOLVED: { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Resolved" },
  CLOSED: { chip: "bg-cream-200 text-ink-500 border-cream-300", label: "Closed" },
};

export const SLA_STYLE: Record<SlaState, { chip: string; bar: string; label: string; text: string }> = {
  ON_TRACK: { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", label: "On track", text: "text-emerald-700" },
  AT_RISK: { chip: "bg-amber-50 text-amber-700 border-amber-200", bar: "bg-amber-500", label: "At risk", text: "text-amber-700" },
  BREACHED: { chip: "bg-rose-500/12 text-rose-600 border-rose-400/40", bar: "bg-rose-500", label: "Breached", text: "text-rose-600" },
  MET: { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", label: "Met", text: "text-emerald-700" },
};

export const SENTIMENT_STYLE: Record<Sentiment, { emoji: string; chip: string; label: string }> = {
  DELIGHTED: { emoji: "🤍", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Delighted" },
  POSITIVE: { emoji: "🙂", chip: "bg-emerald-50/70 text-emerald-700 border-emerald-100", label: "Positive" },
  NEUTRAL: { emoji: "•", chip: "bg-cream-200 text-ink-500 border-cream-300", label: "Neutral" },
  FRUSTRATED: { emoji: "😕", chip: "bg-amber-50 text-amber-700 border-amber-200", label: "Frustrated" },
  ANGRY: { emoji: "😠", chip: "bg-rose-500/12 text-rose-600 border-rose-400/40", label: "Angry" },
};

export const CATEGORY_LABEL: Record<Category, string> = {
  BOOKING: "Booking",
  CANCELLATION: "Cancellation",
  REFUND: "Refund",
  COMPLAINT: "Complaint",
  SERVICE_QUESTION: "Service question",
  PRODUCT_QUESTION: "Product question",
  AFTERCARE: "Aftercare",
  PRICING: "Pricing",
  GIFT_CARD: "Gift card",
  MEMBERSHIP: "Membership",
  FEEDBACK: "Feedback",
  OTHER: "Other",
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  EMAIL: "Email",
  CHAT: "Live chat",
  INSTAGRAM: "Instagram",
  PHONE: "Phone",
  WEB_FORM: "Web form",
  SMS: "SMS",
};

export const TIER_STYLE: Record<Tier, { chip: string; label: string }> = {
  DIAMOND: { chip: "bg-plum-gradient text-white border-transparent", label: "Diamond" },
  PLATINUM: { chip: "bg-blush-300 text-plum-800 border-blush-300", label: "Platinum" },
  GOLD: { chip: "bg-gold-300 text-plum-800 border-gold-400", label: "Gold" },
  SILVER: { chip: "bg-cream-300 text-ink-600 border-cream-300", label: "Silver" },
  NEW: { chip: "bg-white text-ink-500 border-blush-200", label: "New" },
};

export const ESCALATION_LABEL: Record<string, string> = {
  L1_SENIOR_AGENT: "Senior agent",
  L2_SHIFT_MANAGER: "Shift manager",
  L3_SALON_DIRECTOR: "Salon director",
};

export const TRIGGER_LABEL: Record<string, string> = {
  SLA_BREACH: "SLA breach",
  SENTIMENT: "Sentiment",
  MANUAL: "Manual",
  VIP_URGENT: "VIP urgent",
  AI_RECOMMENDED: "AI recommended",
};

/**
 * Categorical series colours — assigned in this fixed order, never cycled.
 * Validated for the lightness band, chroma floor, CVD separation, normal-vision
 * separation and 3:1 contrast against a white chart surface.
 */
export const CHART_COLORS = ["#BE4A6E", "#7048C2", "#00896A", "#B07A0A", "#2F6BC4", "#6B7A00"];

/** Single hue for magnitude-only charts (one series, no legend needed). */
export const CHART_SINGLE_HUE = "#BE4A6E";

/** Priority is severity — a sequential ramp in one hue, light to dark. */
export const PRIORITY_CHART_COLORS: Record<string, string> = {
  LOW: "#F0BFCC",
  MEDIUM: "#DE8AA0",
  HIGH: "#C85E7E",
  URGENT: "#A32E52",
};

/** Sentiment is polarity — diverging, two hues with a neutral grey midpoint. */
export const SENTIMENT_CHART_COLORS: Record<string, string> = {
  ANGRY: "#A32E52",
  FRUSTRATED: "#D3798E",
  NEUTRAL: "#B9AEB4",
  POSITIVE: "#6FAE8C",
  DELIGHTED: "#2E7D5B",
};

/** Reserved status colours — never reused as a categorical series. */
export const STATUS_CHART_COLORS = {
  good: "#2E7D5B",
  warning: "#B07A0A",
  critical: "#A32E52",
  neutral: "#B9AEB4",
};
