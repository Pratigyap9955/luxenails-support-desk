import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { computeSla } from "../services/sla.service";

export const customersRouter = Router();
customersRouter.use(requireAuth);

const TIERS = ["DIAMOND", "PLATINUM", "GOLD", "SILVER", "NEW"] as const;

const listSchema = z.object({
  search: z.string().optional(),
  tier: z.enum(TIERS).optional(),
  sort: z.enum(["name", "value", "recent", "visits"]).default("value"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

customersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listSchema.parse(req.query);

    const where: Prisma.CustomerWhereInput = {
      ...(q.tier ? { tier: q.tier } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: "insensitive" } },
              { email: { contains: q.search, mode: "insensitive" } },
              { phone: { contains: q.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.CustomerOrderByWithRelationInput =
      q.sort === "name"
        ? { name: "asc" }
        : q.sort === "recent"
          ? { lastVisitAt: "desc" }
          : q.sort === "visits"
            ? { totalVisits: "desc" }
            : { lifetimeValue: "desc" };

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          _count: { select: { tickets: true } },
          tickets: {
            where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
            select: { id: true, number: true, subject: true, priority: true, status: true },
            take: 3,
            orderBy: { createdAt: "desc" },
          },
        },
      }),
    ]);

    res.json({
      customers,
      pagination: { page: q.page, pageSize: q.pageSize, total, pages: Math.ceil(total / q.pageSize) },
    });
  }),
);

customersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        tickets: {
          orderBy: { createdAt: "desc" },
          include: { assignee: { select: { name: true, avatarHue: true } } },
        },
      },
    });
    if (!customer) throw notFound("Customer not found");

    const tickets = customer.tickets.map((t) => ({ ...t, sla: computeSla(t) }));

    // Small profile summary the UI shows above the ticket history.
    const resolved = tickets.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED");
    const csatScores = resolved.map((t) => t.csatScore).filter((s): s is number => typeof s === "number");

    res.json({
      customer: { ...customer, tickets },
      stats: {
        totalTickets: tickets.length,
        openTickets: tickets.length - resolved.length,
        escalations: tickets.filter((t) => t.isEscalated).length,
        avgCsat: csatScores.length
          ? Number((csatScores.reduce((a, b) => a + b, 0) / csatScores.length).toFixed(2))
          : null,
        negativeSentimentCount: tickets.filter((t) => t.sentiment === "ANGRY" || t.sentiment === "FRUSTRATED").length,
      },
    });
  }),
);

const upsertSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  tier: z.enum(TIERS).default("NEW"),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  totalVisits: z.number().int().min(0).default(0),
  lifetimeValue: z.number().min(0).default(0),
  preferredTech: z.string().optional().nullable(),
  allergies: z.string().optional().nullable(),
});

customersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = upsertSchema.parse(req.body);
    const customer = await prisma.customer.create({
      data: { ...input, email: input.email.toLowerCase() },
    });
    res.status(201).json({ customer });
  }),
);

customersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = upsertSchema.partial().parse(req.body);
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: { ...input, ...(input.email ? { email: input.email.toLowerCase() } : {}) },
    });
    res.json({ customer });
  }),
);
