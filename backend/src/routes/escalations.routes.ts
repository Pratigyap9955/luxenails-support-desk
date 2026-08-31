import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { acknowledgeEscalation, resolveEscalation } from "../services/escalation.service";
import { sendSlackAlert } from "../services/slack.service";
import { computeSla } from "../services/sla.service";

export const escalationsRouter = Router();
escalationsRouter.use(requireAuth);

escalationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "all"]).default("all") })
      .parse(req.query);

    const escalations = await prisma.escalation.findMany({
      where: status === "all" ? {} : { status },
      include: {
        ticket: {
          include: {
            customer: { select: { name: true, tier: true, email: true } },
            assignee: { select: { name: true, avatarHue: true } },
          },
        },
      },
      orderBy: { triggeredAt: "desc" },
    });

    const rows = escalations.map((e) => ({ ...e, ticket: { ...e.ticket, sla: computeSla(e.ticket) } }));

    res.json({
      escalations: rows,
      summary: {
        open: rows.filter((e) => e.status === "OPEN").length,
        acknowledged: rows.filter((e) => e.status === "ACKNOWLEDGED").length,
        resolved: rows.filter((e) => e.status === "RESOLVED").length,
        byTrigger: Object.entries(
          rows.reduce<Record<string, number>>((acc, e) => {
            acc[e.trigger] = (acc[e.trigger] ?? 0) + 1;
            return acc;
          }, {}),
        ).map(([name, value]) => ({ name, value })),
      },
    });
  }),
);

escalationsRouter.post(
  "/:id/acknowledge",
  asyncHandler(async (req, res) => {
    const escalation = await acknowledgeEscalation(req.params.id, req.user!.id, req.user!.name);
    res.json({ escalation });
  }),
);

escalationsRouter.post(
  "/:id/resolve",
  asyncHandler(async (req, res) => {
    const escalation = await resolveEscalation(req.params.id, req.user!.id, req.user!.name);
    res.json({ escalation });
  }),
);

/** The Slack outbox — every alert the desk has raised, delivered or simulated. */
escalationsRouter.get(
  "/slack/alerts",
  asyncHandler(async (_req, res) => {
    const alerts = await prisma.slackAlert.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    res.json({ alerts });
  }),
);

escalationsRouter.post(
  "/slack/test",
  asyncHandler(async (req, res) => {
    const { message } = z
      .object({ message: z.string().min(1).default("Test alert from the LUXENAILS support desk.") })
      .parse(req.body ?? {});

    const alert = await sendSlackAlert({
      title: "Connection test",
      text: message,
      fields: { "Triggered by": req.user!.name, Desk: "LUXENAILS Client Care" },
    });

    res.json({ alert });
  }),
);
