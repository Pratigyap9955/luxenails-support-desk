import { Router } from "express";
import { authRouter } from "./auth.routes";
import { ticketsRouter } from "./tickets.routes";
import { customersRouter } from "./customers.routes";
import { kbRouter } from "./kb.routes";
import { triageRouter } from "./triage.routes";
import { slaRouter } from "./sla.routes";
import { escalationsRouter } from "./escalations.routes";
import { analyticsRouter } from "./analytics.routes";
import { notificationsRouter } from "./notifications.routes";
import { settingsRouter } from "./settings.routes";
import { cronRouter } from "./cron.routes";
import { publicRuntimeConfig } from "../config/env";
import { prisma } from "../lib/prisma";

export const apiRouter = Router();

/** Unauthenticated — the login screen reads this to show the Demo Mode banner. */
apiRouter.get("/health", async (_req, res) => {
  let database = "connected";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unavailable";
  }

  res.json({
    status: database === "connected" ? "ok" : "degraded",
    service: "LUXENAILS Support Desk API",
    database,
    ...publicRuntimeConfig(),
    time: new Date().toISOString(),
  });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/tickets", ticketsRouter);
apiRouter.use("/customers", customersRouter);
apiRouter.use("/knowledge", kbRouter);
apiRouter.use("/triage", triageRouter);
apiRouter.use("/sla", slaRouter);
apiRouter.use("/escalations", escalationsRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/cron", cronRouter);
