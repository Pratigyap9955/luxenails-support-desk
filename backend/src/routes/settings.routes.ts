import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/error";
import { requireAuth, requireRole } from "../middleware/auth";
import { env, publicRuntimeConfig } from "../config/env";
import { testAiConnection } from "../services/ai.service";
import { reindexAll } from "../services/rag.service";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

/** Runtime configuration + index health, shown on the Settings page. */
settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [settings, policies, articles, chunks, users] = await Promise.all([
      prisma.setting.findMany(),
      prisma.slaPolicy.findMany({ orderBy: { firstResponseMins: "asc" } }),
      prisma.knowledgeArticle.count(),
      prisma.knowledgeChunk.count(),
      prisma.user.count({ where: { active: true } }),
    ]);

    res.json({
      runtime: publicRuntimeConfig(),
      preferences: Object.fromEntries(settings.map((s) => [s.key, s.value])),
      policies,
      index: { articles, chunks, dims: 512 },
      team: { activeUsers: users },
      environment: {
        nodeEnv: env.nodeEnv,
        // Never echo the key itself — only whether one is present.
        anthropicKeyPresent: env.anthropicApiKey.length > 0,
        slackWebhookPresent: env.slackWebhookUrl.length > 0,
      },
    });
  }),
);

settingsRouter.put(
  "/preferences",
  asyncHandler(async (req, res) => {
    const body = z.record(z.string(), z.unknown()).parse(req.body ?? {});

    const saved = await Promise.all(
      Object.entries(body).map(([key, value]) =>
        prisma.setting.upsert({
          where: { key },
          update: { value: value as object },
          create: { key, value: value as object },
        }),
      ),
    );

    res.json({ preferences: Object.fromEntries(saved.map((s) => [s.key, s.value])) });
  }),
);

settingsRouter.post(
  "/test-ai",
  asyncHandler(async (_req, res) => {
    res.json(await testAiConnection());
  }),
);

settingsRouter.post(
  "/reindex",
  requireRole("ADMIN", "MANAGER"),
  asyncHandler(async (_req, res) => {
    const started = Date.now();
    const result = await reindexAll();
    res.json({ ...result, tookMs: Date.now() - started });
  }),
);
