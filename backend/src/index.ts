import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { startSlaMonitor, stopSlaMonitor } from "./services/sla.service";
import { disconnectPrisma, prisma } from "./lib/prisma";

const app = express();

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin/tooling requests arrive without an Origin header.
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
if (!env.isProd) app.use(morgan("dev"));

app.use("/api", apiRouter);
app.get("/", (_req, res) => res.redirect("/api/health"));

app.use(notFoundHandler);
app.use(errorHandler);

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
