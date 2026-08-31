import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error";

/**
 * Builds the Express application: middleware, routes, error handling.
 *
 * Deliberately does NOT call `listen()` or start the SLA scanner — those are
 * concerns of a long-lived process (see index.ts). Keeping them out means the
 * exact same app can be exported as a Vercel serverless function, where there
 * is no persistent process and the scanner runs from a cron instead.
 */
export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin/tooling requests arrive without an Origin header.
        // A "*" origin allows any caller — useful when the frontend is on a
        // different Vercel domain and you don't want to pin it.
        if (!origin || env.corsOrigins.includes("*") || env.corsOrigins.includes(origin)) {
          return callback(null, true);
        }
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

  return app;
}

/** A ready-to-use instance — imported directly by the serverless entry point. */
export const app = createApp();
