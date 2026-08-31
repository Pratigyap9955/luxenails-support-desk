import { Router } from "express";
import { runSlaScan } from "../services/sla.service";
import { asyncHandler, unauthorized } from "../middleware/error";
import { logger } from "../lib/logger";

/**
 * Cron endpoints for serverless deployments.
 *
 * On a persistent host the SLA monitor runs on a setInterval (see index.ts).
 * On Vercel there is no long-lived process, so Vercel Cron calls this endpoint
 * on a schedule instead. Vercel automatically sends `Authorization: Bearer
 * <CRON_SECRET>` when the CRON_SECRET env var is set, which is what we check —
 * this route is NOT behind the normal JWT auth.
 */
export const cronRouter = Router();

function assertCronAuthorised(header: string | undefined) {
  const secret = process.env.CRON_SECRET;
  // If no secret is configured, refuse rather than run an open endpoint.
  if (!secret) throw unauthorized("CRON_SECRET is not configured");
  if (header !== `Bearer ${secret}`) throw unauthorized("Invalid cron credentials");
}

cronRouter.post(
  "/sla-scan",
  asyncHandler(async (req, res) => {
    assertCronAuthorised(req.headers.authorization);
    const result = await runSlaScan();
    logger.info("cron", `SLA scan via cron — ${result.scanned} scanned, ${result.breached} breached`);
    res.json({ ok: true, result });
  }),
);

// Vercel Cron issues GET requests by default; accept both.
cronRouter.get(
  "/sla-scan",
  asyncHandler(async (req, res) => {
    assertCronAuthorised(req.headers.authorization);
    const result = await runSlaScan();
    res.json({ ok: true, result });
  }),
);
