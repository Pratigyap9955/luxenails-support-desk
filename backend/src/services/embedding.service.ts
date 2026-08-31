/**
 * Local, deterministic embedding engine.
 *
 * Real vector search needs vectors, and vectors normally need an API key. This
 * module produces them offline with a hashed bag-of-words model (unigrams +
 * bigrams, sublinear term frequency, L2-normalised) so that RAG genuinely works
 * in Demo Mode — same code path, same cosine ranking, no credentials.
 *
 * Vectors are persisted as PostgreSQL `float8[]` on KnowledgeChunk.embedding.
 */

export const EMBEDDING_DIMS = 512;

const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","been","but","by","can","could","did","do","does","for",
  "from","had","has","have","he","her","him","his","how","i","if","in","into","is","it","its",
  "just","me","my","of","on","or","our","she","should","so","some","than","that","the","their",
  "them","then","there","these","they","this","to","was","we","were","what","when","where",
  "which","who","will","with","would","you","your","am","been","being","get","got","also",
]);

/** Cheap suffix normalisation — enough to match "booking"/"booked"/"books". */
function stem(word: string): string {
  if (word.length <= 4) return word;
  for (const suffix of ["ational", "iveness", "ingly", "edly", "ments", "ness", "ing", "ies", "ied", "ers", "est", "ed", "es", "ly", "s"]) {
    if (word.length - suffix.length >= 3 && word.endsWith(suffix)) {
      const base = word.slice(0, -suffix.length);
      if (suffix === "ies" || suffix === "ied") return `${base}y`;
      return base;
    }
  }
  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/** FNV-1a — stable across processes and restarts, unlike JS object ordering. */
function hash(token: string, salt = 0): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h) % EMBEDDING_DIMS;
}

/**
 * Embed a passage into a unit-length vector.
 * Unigrams carry full weight; bigrams add a phrase signal at half weight.
 */
export function embed(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMS).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vector;

  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]}_${tokens[i + 1]}`;
    counts.set(bigram, (counts.get(bigram) ?? 0) + 0.5);
  }

  for (const [term, count] of counts) {
    // Sublinear TF keeps one repeated word from dominating a chunk.
    const weight = 1 + Math.log(count);
    const isBigram = term.includes("_");
    vector[hash(term)] += weight * (isBigram ? 0.5 : 1);
    // A second hash slot halves the collision rate at negligible cost.
    vector[hash(term, 0x9e3779b9)] += weight * 0.5 * (isBigram ? 0.5 : 1);
  }

  return normalize(vector);
}

export function normalize(vector: number[]): number[] {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

/** Cosine similarity. Inputs are already unit vectors, so this is a dot product. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Lexical overlap score (0..1), blended with cosine at query time.
 * Hashed vectors can collide; exact term overlap is a useful corrective.
 */
export function lexicalOverlap(query: string, passage: string): number {
  const q = new Set(tokenize(query));
  if (q.size === 0) return 0;
  const p = new Set(tokenize(passage));
  let hits = 0;
  for (const term of q) if (p.has(term)) hits++;
  return hits / q.size;
}

/**
 * Split long article text into overlapping chunks on paragraph/sentence
 * boundaries so retrieved context stays readable in citations.
 */
export function chunkText(text: string, size: number, overlap: number): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= size) return clean.length ? [clean] : [];

  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (!current.trim()) return;
    chunks.push(current.trim());
    // Carry the tail of this chunk into the next one for context continuity.
    current = overlap > 0 ? current.slice(-overlap) : "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > size) {
      const sentences = paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph];
      for (const sentence of sentences) {
        if (current.length + sentence.length > size) flush();
        current += sentence;
      }
      continue;
    }
    if (current.length + paragraph.length + 2 > size) flush();
    current += (current ? "\n\n" : "") + paragraph;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 20);
}
