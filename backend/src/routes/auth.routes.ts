import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { asyncHandler, badRequest, unauthorized } from "../middleware/error";
import { requireAuth, requireRole, signToken } from "../middleware/auth";

export const authRouter = Router();

// Brute-force guard on credential endpoints only.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProd ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in a few minutes." },
});

const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  title: true,
  avatarHue: true,
  active: true,
  createdAt: true,
} as const;

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Same message either way — don't confirm which accounts exist.
    if (!user || !user.active) throw unauthorized("Incorrect email or password");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw unauthorized("Incorrect email or password");

    const { passwordHash, ...safe } = user;
    res.json({ token: signToken(user.id), user: safe });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

/** Demo convenience: lists the seeded accounts so the login screen can offer them. */
authRouter.get(
  "/demo-accounts",
  asyncHandler(async (_req, res) => {
    if (!env.demoMode) return res.json({ accounts: [] });
    const users = await prisma.user.findMany({
      where: { active: true },
      select: { email: true, name: true, role: true, title: true },
      orderBy: { role: "asc" },
    });
    res.json({ accounts: users.map((u) => ({ ...u, password: "luxe1234" })) });
  }),
);

authRouter.get(
  "/users",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { active: true },
      select: publicUser,
      orderBy: { name: "asc" },
    });
    res.json({ users });
  }),
);

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8, "Use at least 8 characters"),
  role: z.enum(["ADMIN", "MANAGER", "AGENT"]).default("AGENT"),
  title: z.string().optional(),
});

authRouter.post(
  "/users",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const input = createUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) throw badRequest("That email is already registered");

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash: await bcrypt.hash(input.password, env.bcryptRounds),
        role: input.role,
        title: input.title,
        avatarHue: Math.floor(Math.random() * 60) + 310,
      },
      select: publicUser,
    });

    res.status(201).json({ user });
  }),
);

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Use at least 8 characters"),
});

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = passwordSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw unauthorized("Current password is incorrect");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, env.bcryptRounds) },
    });

    res.json({ ok: true });
  }),
);
