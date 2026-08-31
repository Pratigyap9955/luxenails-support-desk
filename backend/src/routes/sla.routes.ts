import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/error";
import { requireAuth, requireRole } from "../middleware/auth";
import { computeSla, runSlaScan } from "../services/sla.service";

export const slaRouter = Router();
slaRouter.use(requireAuth);

/** Live SLA board — open tickets bucketed by how much runway is left. */
slaRouter.get(
  "/monitor",
  asyncHandler(async (_req, res) => {
    const tickets = await prisma.ticket.findMany({
      where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
      include: {
        customer: { select: { name: true, tier: true } },
        assignee: { select: { name: true, avatarHue: true } },
        slaPolicy: true,
      },
    });

    const rows = tickets
      .map((t) => ({ ...t, sla: computeSla(t) }))
      .sort((a, b) => (a.sla.msRemaining ?? Infinity) - (b.sla.msRemaining ?? Infinity));

    const buckets = {
      breached: rows.filter((r) => r.sla.state === "BREACHED"),
      atRisk: rows.filter((r) => r.sla.state === "AT_RISK"),
      onTrack: rows.filter((r) => r.sla.state === "ON_TRACK"),
    };

    // Compliance over everything that has actually been measured against a target.
    const evaluated = await prisma.ticket.findMany({
      where: { OR: [{ firstResponseMet: { not: null } }, { resolutionMet: { not: null } }] },
      select: { firstResponseMet: true, resolutionMet: true },
    });
    const met = evaluated.filter((t) => t.firstResponseMet !== false && t.resolutionMet !== false);

    res.json({
      buckets,
      summary: {
        total: rows.length,
        breached: buckets.breached.length,
        atRisk: buckets.atRisk.length,
        onTrack: buckets.onTrack.length,
        complianceRate: evaluated.length ? Number(((met.length / evaluated.length) * 100).toFixed(1)) : 100,
        measured: evaluated.length,
      },
    });
  }),
);

slaRouter.get(
  "/policies",
  asyncHandler(async (_req, res) => {
    const policies = await prisma.slaPolicy.findMany({ orderBy: { firstResponseMins: "asc" } });
    res.json({ policies });
  }),
);

const policySchema = z.object({
  firstResponseMins: z.number().int().min(1).max(20160),
  resolutionMins: z.number().int().min(1).max(40320),
  escalateAfterMins: z.number().int().min(0).max(20160),
  active: z.boolean().optional(),
  businessHoursOnly: z.boolean().optional(),
});

slaRouter.patch(
  "/policies/:id",
  requireRole("ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const input = policySchema.partial().parse(req.body);
    const policy = await prisma.slaPolicy.update({ where: { id: req.params.id }, data: input });
    res.json({ policy });
  }),
);

/** Fire the monitor immediately rather than waiting for the timer. */
slaRouter.post(
  "/scan",
  asyncHandler(async (_req, res) => {
    res.json({ result: await runSlaScan() });
  }),
);
