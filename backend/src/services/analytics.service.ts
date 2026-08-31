import { prisma } from "../lib/prisma";
import { computeSla } from "./sla.service";

const DAY = 86_400_000;

const startOfDay = (d: Date) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/** Headline numbers for the Dashboard hero row. */
export async function getOverview() {
  const now = new Date();
  const since24h = new Date(now.getTime() - DAY);

  const [tickets, escalationsOpen, pendingDrafts, articles, customers] = await Promise.all([
    prisma.ticket.findMany({
      include: { customer: { select: { name: true, tier: true } }, assignee: { select: { name: true } } },
    }),
    prisma.escalation.count({ where: { status: { not: "RESOLVED" } } }),
    prisma.replyDraft.count({ where: { status: "PENDING" } }),
    prisma.knowledgeArticle.count({ where: { published: true } }),
    prisma.customer.count(),
  ]);

  const open = tickets.filter((t) => t.status !== "RESOLVED" && t.status !== "CLOSED");
  const resolved = tickets.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED");
  const withSla = open.map((t) => ({ ticket: t, sla: computeSla(t, now) }));

  // Mean minutes from ticket creation to the first agent reply.
  const responded = tickets.filter((t) => t.firstResponseAt);
  const avgFirstResponseMins = responded.length
    ? Math.round(
        responded.reduce((acc, t) => acc + (t.firstResponseAt!.getTime() - t.createdAt.getTime()), 0) /
          responded.length /
          60000,
      )
    : 0;

  const resolvedTimed = resolved.filter((t) => t.resolvedAt);
  const avgResolutionMins = resolvedTimed.length
    ? Math.round(
        resolvedTimed.reduce((acc, t) => acc + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0) /
          resolvedTimed.length /
          60000,
      )
    : 0;

  const slaEvaluated = tickets.filter((t) => t.firstResponseMet !== null || t.resolutionMet !== null);
  const slaMet = slaEvaluated.filter((t) => t.firstResponseMet !== false && t.resolutionMet !== false);

  const csat = resolved.map((t) => t.csatScore).filter((s): s is number => typeof s === "number");
  const triaged = tickets.filter((t) => t.triagedByAi && t.aiConfidence !== null);

  return {
    openTickets: open.length,
    newToday: tickets.filter((t) => t.createdAt >= since24h).length,
    resolvedToday: resolved.filter((t) => t.resolvedAt && t.resolvedAt >= since24h).length,
    unassigned: open.filter((t) => !t.assigneeId).length,
    urgent: open.filter((t) => t.priority === "URGENT").length,
    atRisk: withSla.filter((x) => x.sla.state === "AT_RISK").length,
    breached: withSla.filter((x) => x.sla.state === "BREACHED").length,
    escalationsOpen,
    pendingDrafts,
    avgFirstResponseMins,
    avgResolutionMins,
    slaComplianceRate: slaEvaluated.length ? Number(((slaMet.length / slaEvaluated.length) * 100).toFixed(1)) : 100,
    avgCsat: csat.length ? Number((csat.reduce((a, b) => a + b, 0) / csat.length).toFixed(2)) : null,
    aiTriageRate: tickets.length ? Number(((triaged.length / tickets.length) * 100).toFixed(1)) : 0,
    avgAiConfidence: triaged.length
      ? Number((triaged.reduce((acc, t) => acc + (t.aiConfidence ?? 0), 0) / triaged.length).toFixed(2))
      : 0,
    negativeSentiment: open.filter((t) => t.sentiment === "ANGRY" || t.sentiment === "FRUSTRATED").length,
    totalCustomers: customers,
    publishedArticles: articles,
  };
}

/** Time series + breakdowns for the Analytics page. */
export async function getAnalytics(days = 14) {
  const now = new Date();
  const since = startOfDay(new Date(now.getTime() - (days - 1) * DAY));

  const tickets = await prisma.ticket.findMany({
    include: { assignee: { select: { id: true, name: true, avatarHue: true } } },
  });
  const recent = tickets.filter((t) => t.createdAt >= since);

  // Daily volume: created vs. resolved.
  const volume: { date: string; created: number; resolved: number; escalated: number }[] = [];
  for (let i = 0; i < days; i++) {
    const dayStart = new Date(since.getTime() + i * DAY);
    const dayEnd = new Date(dayStart.getTime() + DAY);
    volume.push({
      date: dayStart.toISOString().slice(0, 10),
      created: tickets.filter((t) => t.createdAt >= dayStart && t.createdAt < dayEnd).length,
      resolved: tickets.filter((t) => t.resolvedAt && t.resolvedAt >= dayStart && t.resolvedAt < dayEnd).length,
      escalated: tickets.filter((t) => t.isEscalated && t.createdAt >= dayStart && t.createdAt < dayEnd).length,
    });
  }

  const countBy = <K extends string>(items: { [k: string]: unknown }[], key: string) => {
    const map = new Map<K, number>();
    for (const item of items) {
      const value = item[key] as K;
      map.set(value, (map.get(value) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  // Per-agent throughput and quality.
  const agents = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, avatarHue: true, role: true },
  });

  const agentStats = agents.map((agent) => {
    const assigned = tickets.filter((t) => t.assigneeId === agent.id);
    const closed = assigned.filter((t) => t.resolvedAt);
    const csat = closed.map((t) => t.csatScore).filter((s): s is number => typeof s === "number");
    const responded = assigned.filter((t) => t.firstResponseAt);
    return {
      id: agent.id,
      name: agent.name,
      avatarHue: agent.avatarHue,
      role: agent.role,
      assigned: assigned.length,
      resolved: closed.length,
      open: assigned.length - closed.length,
      avgFirstResponseMins: responded.length
        ? Math.round(
            responded.reduce((acc, t) => acc + (t.firstResponseAt!.getTime() - t.createdAt.getTime()), 0) /
              responded.length /
              60000,
          )
        : 0,
      avgCsat: csat.length ? Number((csat.reduce((a, b) => a + b, 0) / csat.length).toFixed(2)) : null,
      slaBreaches: assigned.filter((t) => t.firstResponseMet === false || t.resolutionMet === false).length,
    };
  });

  const drafts = await prisma.replyDraft.findMany();
  const reviewed = drafts.filter((d) => d.status !== "PENDING");
  const accepted = drafts.filter((d) => d.status === "APPROVED");
  const edited = drafts.filter((d) => d.status === "EDITED");

  const articles = await prisma.knowledgeArticle.findMany({
    select: { id: true, title: true, category: true, useCount: true, views: true },
    orderBy: { useCount: "desc" },
    take: 8,
  });

  return {
    range: { days, from: since.toISOString(), to: now.toISOString() },
    volume,
    byCategory: countBy(recent, "category"),
    byPriority: countBy(recent, "priority"),
    byChannel: countBy(recent, "channel"),
    bySentiment: countBy(recent, "sentiment"),
    byStatus: countBy(
      tickets.filter((t) => t.status !== "CLOSED"),
      "status",
    ),
    agentStats: agentStats.sort((a, b) => b.resolved - a.resolved),
    ai: {
      totalDrafts: drafts.length,
      approvedAsWritten: accepted.length,
      editedBeforeSending: edited.length,
      rejected: drafts.filter((d) => d.status === "REJECTED").length,
      pending: drafts.filter((d) => d.status === "PENDING").length,
      // "Accepted" counts edits too — an edited draft still saved the agent the blank page.
      acceptanceRate: reviewed.length
        ? Number((((accepted.length + edited.length) / reviewed.length) * 100).toFixed(1))
        : 0,
      cleanApprovalRate: reviewed.length ? Number(((accepted.length / reviewed.length) * 100).toFixed(1)) : 0,
      avgConfidence: drafts.length
        ? Number((drafts.reduce((acc, d) => acc + d.confidence, 0) / drafts.length).toFixed(2))
        : 0,
    },
    topArticles: articles,
  };
}
