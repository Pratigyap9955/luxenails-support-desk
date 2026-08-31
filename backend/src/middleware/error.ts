import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "../lib/logger";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const unauthorized = (msg = "Not authenticated") => new HttpError(401, msg);
export const forbidden = (msg = "Not allowed") => new HttpError(403, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);

/** Wraps an async route handler so rejected promises reach the error middleware. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "field";
      return res.status(409).json({ error: `That ${target} is already in use.` });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Record not found." });
    }
    if (err.code === "P2003") {
      return res.status(409).json({ error: "Related record is missing or still referenced." });
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    logger.error("db", "Database unavailable", err.message);
    return res.status(503).json({
      error:
        "Database unavailable. Start PostgreSQL (docker compose up -d) and run `npm run db:setup`.",
    });
  }

  const message = err instanceof Error ? err.message : "Unexpected server error";
  logger.error("http", message, err instanceof Error ? err.stack : err);
  return res.status(500).json({ error: "Unexpected server error", details: message });
}
