/**
 * RAG service — chunking, indexing and vector retrieval over the salon's
 * knowledge base.
 *
 * Storage: KnowledgeChunk.embedding is a PostgreSQL float8[]. Retrieval scores
 * every chunk by cosine similarity and blends in lexical overlap, which keeps
 * hashed-vector collisions from surfacing an irrelevant passage. The corpus is
 * salon policy — tens of articles, not millions — so an exact scan is both
 * faster and more accurate than an approximate index.
 */

import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { chunkText, cosineSimilarity, embed, lexicalOverlap } from "./embedding.service";
import type { RagCitation } from "../types/ai";

/** Weighting between semantic similarity and exact term overlap. */
const COSINE_WEIGHT = 0.7;
const LEXICAL_WEIGHT = 0.3;

/** (Re)builds the vector index for a single article. Safe to call repeatedly. */
export async function indexArticle(articleId: string): Promise<number> {
  const article = await prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
  if (!article) return 0;

  // Chunk the body only — the title is a retrieval signal, not quotable text.
  // Leaving it in the chunk makes citations read "Refunds and redos Every
  // treatment at LUXENAILS…" when a drafted reply quotes the passage.
  const passages = chunkText(article.content, env.ragChunkSize, env.ragChunkOverlap);

  await prisma.$transaction([
    prisma.knowledgeChunk.deleteMany({ where: { articleId } }),
    prisma.knowledgeChunk.createMany({
      data: passages.map((content, ordinal) => {
        // Title and tags are prepended so a chunk carries its own topic signal.
        const vector = embed(`${article.title} ${article.tags.join(" ")} ${content}`);
        return { articleId, ordinal, content, embedding: vector, dims: vector.length };
      }),
    }),
  ]);

  return passages.length;
}

/** Rebuilds the whole index — used by the seed and the Settings "Reindex" action. */
export async function reindexAll(): Promise<{ articles: number; chunks: number }> {
  const articles = await prisma.knowledgeArticle.findMany({ select: { id: true } });
  let chunks = 0;
  for (const { id } of articles) chunks += await indexArticle(id);
  logger.success("rag", `Indexed ${chunks} chunks across ${articles.length} articles`);
  return { articles: articles.length, chunks };
}

export interface SearchOptions {
  topK?: number;
  minScore?: number;
  category?: string;
}

/**
 * Vector search over published articles.
 * Returns at most one chunk per article so citations stay diverse.
 */
export async function searchKnowledge(query: string, options: SearchOptions = {}): Promise<RagCitation[]> {
  const topK = options.topK ?? env.ragTopK;
  const minScore = options.minScore ?? env.ragMinScore;

  if (!query.trim()) return [];

  const queryVector = embed(query);

  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      article: {
        published: true,
        ...(options.category ? { category: options.category } : {}),
      },
    },
    include: { article: { select: { id: true, title: true, category: true } } },
  });

  const scored = chunks
    .map((chunk) => {
      const cosine = cosineSimilarity(queryVector, chunk.embedding);
      const lexical = lexicalOverlap(query, chunk.content);
      return {
        chunk,
        score: COSINE_WEIGHT * cosine + LEXICAL_WEIGHT * lexical,
      };
    })
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score);

  const seenArticles = new Set<string>();
  const citations: RagCitation[] = [];

  for (const { chunk, score } of scored) {
    if (seenArticles.has(chunk.articleId)) continue;
    seenArticles.add(chunk.articleId);
    citations.push({
      articleId: chunk.articleId,
      chunkId: chunk.id,
      title: chunk.article.title,
      category: chunk.article.category,
      snippet: chunk.content,
      score: Number(score.toFixed(4)),
    });
    if (citations.length >= topK) break;
  }

  // Retrieval is a signal worth tracking — it shows which policies get used.
  if (citations.length > 0) {
    await prisma.knowledgeArticle.updateMany({
      where: { id: { in: citations.map((c) => c.articleId) } },
      data: { useCount: { increment: 1 } },
    });
  }

  return citations;
}
