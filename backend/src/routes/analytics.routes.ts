import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { getAnalytics, getOverview } from "../services/analytics.service";
import { computeSla } from "../services/sla.service";

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

analyticsRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    res.json({ overview: await getOverview() });
  }),
);

analyticsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(90).default(14) }).parse(req.query);
    res.json({ analytics: await getAnalytics(days) });
  }),
);

/** Everything the Dashboard needs in one round trip. */
analyticsRouter.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const [overview, urgentRows, recentRows, activity, alerts] = await Promise.all([
      getOverview(),
      prisma.ticket.findMany({
        where: {
          status: { notIn: ["RESOLVED", "CLOSED"] },
          OR: [{ priority: "URGENT" }, { priority: "HIGH" }, { slaState: { in: ["AT_RISK", "BREACHED"] } }],
        },
        include: { customer: { select: { name: true, tier: true } }, assignee: { select: { name: true, avatarHue: true } } },
        orderBy: { createdAt: "asc" },
        take: 6,
      }),
      prisma.ticket.findMany({
        include: { customer: { select: { name: true, tier: true } }, assignee: { select: { name: true, avatarHue: true } } },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.ticketEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { ticket: { select: { number: true, subject: true } } },
      }),
      prisma.slackAlert.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    ]);

    res.json({
      overview,
      needsAttention: urgentRows.map((t) => ({ ...t, sla: computeSla(t) })),
      recent: recentRows.map((t) => ({ ...t, sla: computeSla(t) })),
      activity,
      alerts,
    });
  }),
);
