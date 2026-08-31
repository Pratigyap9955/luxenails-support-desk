import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { isAiLive, triageTicket } from "../services/ai.service";
import { searchKnowledge } from "../services/rag.service";
import { runTriage } from "../services/workflow.service";
import { computeSla } from "../services/sla.service";
import { env } from "../config/env";

export const triageRouter = Router();
triageRouter.use(requireAuth);

/** The triage board: what still needs classifying, and what the AI just did. */
triageRouter.get(
  "/queue",
  asyncHandler(async (_req, res) => {
    const [untriaged, recentlyTriaged, lowConfidence, pendingDrafts] = await Promise.all([
      prisma.ticket.findMany({
        where: { triagedByAi: false, status: { notIn: ["RESOLVED", "CLOSED"] } },
        include: {
          customer: { select: { name: true, tier: true } },
          messages: { where: { authorType: "CUSTOMER" }, orderBy: { createdAt: "asc" }, take: 1 },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.ticket.findMany({
        where: { triagedByAi: true },
        include: { customer: { select: { name: true, tier: true } } },
        orderBy: { triagedAt: "desc" },
        take: 12,
      }),
      prisma.ticket.findMany({
        where: { triagedByAi: true, aiConfidence: { lt: 0.6 }, status: { notIn: ["RESOLVED", "CLOSED"] } },
        include: { customer: { select: { name: true, tier: true } } },
        orderBy: { aiConfidence: "asc" },
        take: 10,
      }),
      prisma.replyDraft.findMany({
        where: { status: "PENDING" },
        include: { ticket: { include: { customer: { select: { name: true, tier: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const triagedTotal = await prisma.ticket.count({ where: { triagedByAi: true } });
    const confidenceAgg = await prisma.ticket.aggregate({
      where: { triagedByAi: true },
      _avg: { aiConfidence: true },
    });

    res.json({
      untriaged: untriaged.map((t) => ({ ...t, sla: computeSla(t) })),
      recentlyTriaged: recentlyTriaged.map((t) => ({ ...t, sla: computeSla(t) })),
      lowConfidence,
      pendingDrafts,
      stats: {
        untriagedCount: untriaged.length,
        triagedTotal,
        avgConfidence: Number((confidenceAgg._avg.aiConfidence ?? 0).toFixed(2)),
        pendingDrafts: pendingDrafts.length,
        engine: isAiLive() ? "Claude" : "Demo Engine",
        model: isAiLive() ? env.anthropicModel : "luxenails-demo-v1",
      },
    });
  }),
);

/**
 * Classify arbitrary text without creating a ticket, and show what the RAG
 * index would retrieve for it. This is the "try it" panel on the AI Triage page.
 */
triageRouter.post(
  "/preview",
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        subject: z.string().min(3),
        body: z.string().min(5),
        channel: z.string().default("EMAIL"),
        customerTier: z.enum(["DIAMOND", "PLATINUM", "GOLD", "SILVER", "NEW"]).default("GOLD"),
        customerName: z.string().default("Guest"),
      })
      .parse(req.body);

    const started = Date.now();
    const result = await triageTicket({
      subject: input.subject,
      body: input.body,
      channel: input.channel,
      customer: {
        name: input.customerName,
        tier: input.customerTier,
        totalVisits: 0,
        lifetimeValue: 0,
        lastVisitAt: null,
      },
    });

    const citations = await searchKnowledge(`${input.subject}. ${input.body}`);

    res.json({ triage: result, citations, tookMs: Date.now() - started });
  }),
);

/** Triage every untriaged ticket in one pass. */
triageRouter.post(
  "/batch",
  asyncHandler(async (req, res) => {
    const pending = await prisma.ticket.findMany({
      where: { triagedByAi: false, status: { notIn: ["RESOLVED", "CLOSED"] } },
      select: { id: true },
      take: 25,
    });

    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const { id } of pending) {
      try {
        await runTriage(id, req.user!);
        results.push({ id, ok: true });
      } catch (error) {
        // One bad ticket shouldn't abort the batch.
        results.push({ id, ok: false, error: error instanceof Error ? error.message : "failed" });
      }
    }

    res.json({
      processed: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  }),
);
