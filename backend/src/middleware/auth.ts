import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { forbidden, unauthorized } from "./error";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  title: string | null;
  avatarHue: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

/** Rejects the request unless a valid, active user is attached. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) throw unauthorized("Missing bearer token");

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    } catch {
      throw unauthorized("Session expired — please sign in again");
    }

    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, email: true, name: true, role: true, title: true, avatarHue: true, active: true },
    });

    if (!user || !user.active) throw unauthorized("Account is no longer active");

    const { active, ...authUser } = user;
    req.user = authUser;
    next();
  } catch (err) {
    next(err);
  }
}

/** Route guard for role-restricted endpoints. Use after `requireAuth`. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`Requires one of: ${roles.join(", ")}`));
    }
    next();
  };
}
