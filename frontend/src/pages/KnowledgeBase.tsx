import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Database, Eye, Plus, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react";
import { api, qs } from "../lib/api";
import { cn, timeAgo } from "../lib/format";
import {
  Badge, Button, Card, EmptyState, ErrorState, Input, LoadingBlock, Modal, SectionHeader, Textarea,
} from "../components/ui";
import { useToast } from "../context/ToastContext";
import type { Citation, KnowledgeArticle } from "../lib/types";

export function KnowledgeBasePage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [editor, setEditor] = useState<{ open: boolean; article: KnowledgeArticle | null }>({
    open: false,
    article: null,
  });
  const [viewing, setViewing] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["kb", search, category],
    queryFn: () =>
      api.get<{ articles: KnowledgeArticle[]; categories: { name: string; count: number }[] }>(
        `/knowledge${qs({ search, category })}`,
      ),
  });

  const reindex = useMutation({
    mutationFn: () => api.post<{ articles: number; chunks: number; tookMs: number }>("/knowledge/reindex"),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["kb"] });
      toast.success(
        "Index rebuilt",
        `${result.chunks} chunks across ${result.articles} articles in ${result.tookMs}ms`,
      );
    },
    onError: (err: Error) => toast.error("Reindex failed", err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/knowledge/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb"] });
      toast.success("Article deleted");
    },
    onError: (err: Error) => toast.error("Could not delete", err.message),
  });

  const totalChunks = data?.articles.reduce((acc, a) => acc + (a._count?.chunks ?? 0), 0) ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-600 text-plum-800">Knowledge Base</h1>
          <p className="mt-1 text-sm text-ink-400">
            {data?.articles.length ?? 0} articles · {totalChunks} embedded chunks powering RAG retrieval
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            icon={<RefreshCw className={cn("h-4 w-4", reindex.isPending && "animate-spin")} />}
            loading={reindex.isPending}
            onClick={() => reindex.mutate()}
          >
            Rebuild index
          </Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditor({ open: true, article: null })}>
            New article
          </Button>
        </div>
      </div>

      <SearchPlayground />

      {/* Filters */}
      <Card className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter articles by title, content or tag…"
            className="field pl-9"
            aria-label="Filter articles"
          />
        </div>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-0.5">
          <button
            onClick={() => setCategory("all")}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              category === "all"
                ? "border-transparent bg-plum-gradient text-white"
                : "border-blush-200 bg-white text-ink-600 hover:border-blush-300",
            )}
          >
            All
          </button>
          {data?.categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => setCategory(cat.name)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                category === cat.name
                  ? "border-transparent bg-plum-gradient text-white"
                  : "border-blush-200 bg-white text-ink-600 hover:border-blush-300",
              )}
            >
              {cat.name} ({cat.count})
            </button>
          ))}
        </div>
      </Card>

      {isLoading ? (
        <LoadingBlock rows={4} />
      ) : error ? (
        <ErrorState message={(error as Error).message} onRetry={refetch} />
      ) : data && data.articles.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.articles.map((article) => (
            <Card key={article.id} hover className="flex flex-col p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <Badge className="border-blush-200 bg-blush-50 text-plum-700">{article.category}</Badge>
                {!article.published && (
                  <Badge className="border-cream-300 bg-cream-200 text-ink-500">Draft</Badge>
                )}
              </div>

              <h3 className="font-display text-base font-600 leading-snug text-plum-800">
                {article.title}
              </h3>
              {article.summary && (
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-500">{article.summary}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {article.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full bg-cream-200 px-2 py-0.5 text-[10px] text-ink-500">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3 border-t border-blush-100 pt-3 text-[11px] text-ink-400">
                <span className="flex items-center gap-1">
                  <Database className="h-3 w-3" /> {article._count?.chunks ?? 0} chunks
                </span>
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> used {article.useCount}×
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" /> {article.views}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-ink-400">
                  {timeAgo(article.updatedAt)}
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setViewing(article.id)}>
                    Read
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditor({ open: true, article })}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete article"
                    onClick={() => {
                      if (confirm(`Delete "${article.title}"? Its chunks will be removed from the index.`)) {
                        remove.mutate(article.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="No articles found"
          description="Write the salon's policies here — they become the ground truth for every AI reply."
          action={<Button onClick={() => setEditor({ open: true, article: null })}>New article</Button>}
        />
      )}

      <ArticleEditor
        open={editor.open}
        article={editor.article}
        onClose={() => setEditor({ open: false, article: null })}
      />
      <ArticleViewer id={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

/** Lets agents run the exact vector search the reply drafter uses. */
function SearchPlayground() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ results: Citation[]; tookMs: number } | null>(null);

  const search = useMutation({
    mutationFn: () => api.post<{ results: Citation[]; tookMs: number }>("/knowledge/search", { query }),
    onSuccess: setResults,
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blush-100 bg-blush-50/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-rose-400" />
          <p className="font-display text-sm font-600 text-plum-800">Vector search</p>
        </div>
        <p className="text-xs text-ink-400">Cosine similarity blended with lexical overlap</p>
      </div>

      <div className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim().length >= 2) search.mutate();
          }}
          className="flex gap-2"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. can I get a refund if my gel lifted after three days?"
            className="field flex-1"
            aria-label="Search the knowledge base"
          />
          <Button type="submit" loading={search.isPending} disabled={query.trim().length < 2}>
            Search
          </Button>
        </form>

        {results && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-ink-400">
              {results.results.length} passages in {results.tookMs}ms
            </p>
            <div className="space-y-2">
              {results.results.map((result) => (
                <div key={result.chunkId} className="rounded-xl border border-blush-100 bg-cream-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-plum-800">{result.title}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-blush-100">
                        <div
                          className="h-full rounded-full bg-rose-400"
                          style={{ width: `${Math.min(100, result.score * 140)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-ink-400">{result.score.toFixed(3)}</span>
                    </div>
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-ink-500">{result.snippet}</p>
                </div>
              ))}
              {results.results.length === 0 && (
                <p className="rounded-xl border border-dashed border-blush-200 px-4 py-6 text-center text-sm text-ink-400">
                  Nothing scored above the relevance threshold. The reply drafter would say it needs to
                  check rather than guess.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ArticleEditor({
  open, article, onClose,
}: {
  open: boolean;
  article: KnowledgeArticle | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [content, setContent] = useState("");
  const [seeded, setSeeded] = useState<string | null>(null);

  // Load the article into the form the first time this instance sees it.
  if (open && seeded !== (article?.id ?? "new")) {
    setTitle(article?.title ?? "");
    setCategory(article?.category ?? "Policies");
    setSummary(article?.summary ?? "");
    setTags(article?.tags.join(", ") ?? "");
    setContent(article?.content ?? "");
    setSeeded(article?.id ?? "new");
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title,
        category,
        summary: summary || null,
        content,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      return article
        ? api.patch<{ chunks: number }>(`/knowledge/${article.id}`, payload)
        : api.post<{ chunks: number }>("/knowledge", payload);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["kb"] });
      toast.success(
        article ? "Article updated" : "Article published",
        `Re-embedded into ${result.chunks} chunks`,
      );
      setSeeded(null);
      onClose();
    },
    onError: (err: Error) => toast.error("Could not save", err.message),
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        setSeeded(null);
        onClose();
      }}
      title={article ? "Edit article" : "New article"}
      description="Saving re-embeds the content so retrieval stays in sync."
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={save.isPending}
            disabled={title.trim().length < 4 || content.trim().length < 20}
            onClick={() => save.mutate()}
          >
            {article ? "Save & reindex" : "Publish & index"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
          <Input
            label="Tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            hint="Comma separated"
          />
        </div>
        <Input
          label="Summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          hint="Shown on the article card"
        />
        <Textarea
          label="Content"
          rows={14}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          hint="Separate topics with blank lines — chunks are split on paragraph boundaries."
        />
      </div>
    </Modal>
  );
}

function ArticleViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["kb-article", id],
    queryFn: () => api.get<{ article: KnowledgeArticle }>(`/knowledge/${id}`).then((r) => r.article),
    enabled: !!id,
  });

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={data?.title ?? "Article"}
      description={data ? `${data.category} · ${data.chunks?.length ?? 0} indexed chunks` : undefined}
      width="max-w-3xl"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      {data ? (
        <div className="space-y-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{data.content}</p>

          <div>
            <SectionHeader title="Indexed chunks" subtitle="Exactly what retrieval can return" />
            <div className="space-y-2">
              {data.chunks?.map((chunk) => (
                <div key={chunk.id} className="rounded-xl border border-blush-100 bg-cream-50 px-4 py-3">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-400">
                    chunk {chunk.ordinal} · {chunk.dims} dimensions
                  </p>
                  <p className="text-xs leading-relaxed text-ink-500">{chunk.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <LoadingBlock rows={3} />
      )}
    </Modal>
  );
}
