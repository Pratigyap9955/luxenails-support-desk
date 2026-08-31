import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { indexArticle, reindexAll, searchKnowledge } from "../services/rag.service";

export const kbRouter = Router();
kbRouter.use(requireAuth);

const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

kbRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = z
      .object({ search: z.string().optional(), category: z.string().optional() })
      .parse(req.query);

    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        ...(q.category && q.category !== "all" ? { category: q.category } : {}),
        ...(q.search
          ? {
              OR: [
                { title: { contains: q.search, mode: "insensitive" } },
                { content: { contains: q.search, mode: "insensitive" } },
                { tags: { has: q.search.toLowerCase() } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { chunks: true } } },
      orderBy: { updatedAt: "desc" },
    });

    const categories = await prisma.knowledgeArticle.groupBy({
      by: ["category"],
      _count: { category: true },
    });

    res.json({
      articles,
      categories: categories
        .map((c) => ({ name: c.category, count: c._count.category }))
        .sort((a, b) => b.count - a.count),
    });
  }),
);

/**
 * Vector search endpoint — the Knowledge Base page uses it to let agents try
 * retrieval directly and see the exact scores the reply drafter receives.
 */
kbRouter.post(
  "/search",
  asyncHandler(async (req, res) => {
    const { query, topK } = z
      .object({ query: z.string().min(2, "Enter at least 2 characters"), topK: z.number().int().min(1).max(10).optional() })
      .parse(req.body);

    const started = Date.now();
    const results = await searchKnowledge(query, { topK });
    res.json({ results, tookMs: Date.now() - started, query });
  }),
);

kbRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: req.params.id },
      include: { chunks: { orderBy: { ordinal: "asc" }, select: { id: true, ordinal: true, content: true, dims: true } } },
    });
    if (!article) throw notFound("Article not found");

    await prisma.knowledgeArticle.update({
      where: { id: article.id },
      data: { views: { increment: 1 } },
    });

    res.json({ article });
  }),
);

const articleSchema = z.object({
  title: z.string().min(4),
  category: z.string().min(2),
  content: z.string().min(20, "An article needs some substance"),
  summary: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  published: z.boolean().default(true),
});

kbRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = articleSchema.parse(req.body);

    // Slugs must stay unique; add a short suffix if the title collides.
    let slug = slugify(input.title);
    if (await prisma.knowledgeArticle.findUnique({ where: { slug } })) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    const article = await prisma.knowledgeArticle.create({
      data: { ...input, slug, tags: input.tags.map((t) => t.toLowerCase()) },
    });

    const chunks = await indexArticle(article.id);
    res.status(201).json({ article, chunks });
  }),
);

kbRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = articleSchema.partial().parse(req.body);
    const article = await prisma.knowledgeArticle.update({
      where: { id: req.params.id },
      data: { ...input, ...(input.tags ? { tags: input.tags.map((t) => t.toLowerCase()) } : {}) },
    });

    // Content changed means the vectors are stale — reindex this article only.
    const chunks = input.content || input.title || input.tags ? await indexArticle(article.id) : 0;
    res.json({ article, chunks });
  }),
);

kbRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.knowledgeArticle.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

kbRouter.post(
  "/reindex",
  asyncHandler(async (_req, res) => {
    const started = Date.now();
    const result = await reindexAll();
    res.json({ ...result, tookMs: Date.now() - started });
  }),
);
