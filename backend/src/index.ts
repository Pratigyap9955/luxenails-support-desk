import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { startSlaMonitor, stopSlaMonitor } from "./services/sla.service";
import { disconnectPrisma, prisma } from "./lib/prisma";

/**
 * Persistent-server entry point — used for local development and for any host
 * that runs a long-lived Node process (Render, Railway, Fly, a VM).
 *
 * On serverless (Vercel) this file is NOT the entry point: `api/index.ts`
 * imports the app directly and the SLA scan runs from a cron instead.
 */
const server = app.listen(env.port, () => {
  logger.banner([
    "LUXENAILS · AI Customer Support Desk",
    "",
    `API        http://localhost:${env.port}/api`,
    `Health     http://localhost:${env.port}/api/health`,
    `Mode       ${env.demoMode ? "DEMO — no API keys required" : "LIVE"}`,
    `AI         ${env.demoMode ? "Local demo engine" : env.anthropicModel}`,
    `Slack      ${!env.demoMode && env.slackWebhookUrl ? env.slackChannel : "simulated (in-app outbox)"}`,
  ]);

  if (env.demoMode && env.anthropicApiKey.length === 0) {
    logger.info("config", "No ANTHROPIC_API_KEY found — AI triage and drafting use the local engine.");
  }

  startSlaMonitor();

  // Surface a dead database at boot rather than on the first request.
  prisma
    .$queryRaw`SELECT 1`
    .then(() => logger.success("db", "PostgreSQL connected"))
    .catch(() =>
      logger.error(
        "db",
        "Cannot reach PostgreSQL. Run `docker compose up -d` then `npm run db:setup` from the repo root.",
      ),
    );
});

async function shutdown(signal: string) {
  logger.info("server", `${signal} received — shutting down`);
  stopSlaMonitor();
  server.close();
  await disconnectPrisma();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
