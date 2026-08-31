import { useState, type FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Filter, Inbox, Plus, Search, X } from "lucide-react";
import { api, qs } from "../lib/api";
import { cn } from "../lib/format";
import { Button, Card, EmptyState, ErrorState, Input, LoadingBlock, Modal, Select, Textarea } from "../components/ui";
import { TicketCard } from "../components/TicketBits";
import { useToast } from "../context/ToastContext";
import { CATEGORY_LABEL, CHANNEL_LABEL } from "../lib/tokens";
import type { Category, Channel, Customer, Priority, Ticket, TicketStatus, User } from "../lib/types";

const STATUSES: TicketStatus[] = ["NEW", "TRIAGED", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED"];
const PRIORITIES: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
const CHANNELS = Object.keys(CHANNEL_LABEL) as Channel[];

const QUICK_FILTERS = [
  { key: "all", label: "All open", params: {} },
  { key: "urgent", label: "Urgent", params: { priority: "URGENT" } },
  { key: "breached", label: "SLA breached", params: { slaState: "BREACHED" } },
  { key: "atrisk", label: "At risk", params: { slaState: "AT_RISK" } },
  { key: "escalated", label: "Escalated", params: { escalated: "true" } },
  { key: "unassigned", label: "Unassigned", params: { assigneeId: "unassigned" } },
  { key: "new", label: "New", params: { status: "NEW" } },
];

export function TicketsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [quick, setQuick] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState("all");
  const [assigneeId, setAssigneeId] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const quickParams = QUICK_FILTERS.find((f) => f.key === quick)?.params ?? {};

  const query = qs({
    ...quickParams,
    ...(status !== "all" ? { status } : {}),
    ...(priority !== "all" ? { priority } : {}),
    ...(category !== "all" ? { category } : {}),
    ...(assigneeId !== "all" ? { assigneeId } : {}),
    search,
    sort,
    page,
    pageSize: 20,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tickets", query],
    queryFn: () =>
      api.get<{ tickets: Ticket[]; pagination: { page: number; pages: number; total: number } }>(
        `/tickets${query}`,
      ),
    placeholderData: keepPreviousData,
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ users: User[] }>("/auth/users").then((r) => r.users),
    staleTime: 300_000,
  });

  const activeFilters = [status, priority, category, assigneeId].filter((v) => v !== "all").length;

  function resetFilters() {
    setStatus("all");
    setPriority("all");
    setCategory("all");
    setAssigneeId("all");
    setSearch("");
    setSearchInput("");
    setQuick("all");
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-600 text-plum-800">Tickets</h1>
          <p className="mt-1 text-sm text-ink-400">
            {data?.pagination.total ?? 0} matching {data?.pagination.total === 1 ? "ticket" : "tickets"}
          </p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setComposeOpen(true)}>
          New ticket
        </Button>
      </div>

      {/* Search + quick filters */}
      <Card className="p-4">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
          className="flex flex-wrap gap-2"
        >
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search subject, customer, or ticket number…"
              className="field pl-9"
              aria-label="Search tickets"
            />
          </div>
          <Button type="submit" variant="secondary">Search</Button>
          <Button
            type="button"
            variant={showFilters || activeFilters ? "primary" : "secondary"}
            icon={<Filter className="h-4 w-4" />}
            onClick={() => setShowFilters((v) => !v)}
          >
            Filters{activeFilters ? ` (${activeFilters})` : ""}
          </Button>
        </form>

        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-0.5">
          {QUICK_FILTERS.map((filter) => (
            <button
              key={filter.key}
              onClick={() => {
                setQuick(filter.key);
                setPage(1);
              }}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                quick === filter.key
                  ? "border-transparent bg-plum-gradient text-white shadow-soft"
                  : "border-blush-200 bg-white text-ink-600 hover:border-blush-300 hover:text-plum-700",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="mt-4 grid gap-3 border-t border-blush-100 pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="all">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>
              ))}
            </Select>
            <Select label="Priority" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
              <option value="all">Any priority</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p.toLowerCase()}</option>
              ))}
            </Select>
            <Select label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
              <option value="all">Any category</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
            <Select label="Assignee" value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); setPage(1); }}>
              <option value="all">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
            <Select label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="priority">Priority</option>
              <option value="sla">SLA urgency</option>
            </Select>
            {activeFilters > 0 && (
              <div className="sm:col-span-2 lg:col-span-5">
                <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={resetFilters}>
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {isLoading ? (
        <LoadingBlock rows={5} />
      ) : error ? (
        <ErrorState message={(error as Error).message} onRetry={refetch} />
      ) : data && data.tickets.length > 0 ? (
        <>
          <div className="grid gap-3 xl:grid-cols-2">
            {data.tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>

          {data.pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-ink-500">
                Page {data.pagination.page} of {data.pagination.pages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= data.pagination.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="No tickets match these filters"
          description="Try clearing the filters, or open a new ticket to see the AI triage run."
          action={<Button variant="secondary" onClick={resetFilters}>Clear filters</Button>}
        />
      )}

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onCreated={(ticket) => {
          queryClient.invalidateQueries({ queryKey: ["tickets"] });
          queryClient.invalidateQueries({ queryKey: ["overview"] });
          toast.success(
            `Ticket #${ticket.number} created`,
            `AI triage: ${CATEGORY_LABEL[ticket.category]} · ${ticket.priority.toLowerCase()} priority`,
          );
          setComposeOpen(false);
          navigate(`/tickets/${ticket.id}`);
        }}
      />
    </div>
  );
}

/** Simulates an inbound customer message and runs it through the pipeline. */
function ComposeModal({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (ticket: Ticket) => void;
}) {
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<Channel>("EMAIL");
  const [customerId, setCustomerId] = useState("");
  const [autoTriage, setAutoTriage] = useState(true);

  const { data: customers } = useQuery({
    queryKey: ["customers", "picker"],
    queryFn: () => api.get<{ customers: Customer[] }>("/customers?pageSize=100&sort=name").then((r) => r.customers),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<{ ticket: Ticket }>("/tickets", { subject, body, channel, customerId, autoTriage }),
    onSuccess: ({ ticket }) => {
      setSubject("");
      setBody("");
      onCreated(ticket);
    },
    onError: (err: Error) => toast.error("Could not create the ticket", err.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New ticket"
      description="Simulates an inbound customer message. AI triage runs on submit."
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={create.isPending}
            disabled={!subject.trim() || body.trim().length < 5 || !customerId}
            onClick={() => create.mutate()}
          >
            Create &amp; triage
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select a customer…</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {c.tier.toLowerCase()}</option>
            ))}
          </Select>
          <Select label="Channel" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
            ))}
          </Select>
        </div>

        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Gel lifted after three days"
        />

        <Textarea
          label="Customer message"
          rows={7}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Paste or write the message exactly as the customer sent it…"
          hint="The AI classifies category, priority and sentiment from this text."
        />

        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-blush-200 bg-cream-50 px-4 py-3">
          <input
            type="checkbox"
            checked={autoTriage}
            onChange={(e) => setAutoTriage(e.target.checked)}
            className="h-4 w-4 accent-rose-500"
          />
          <span className="text-sm text-ink-600">
            Run AI triage immediately
            <span className="block text-xs text-ink-400">
              Sets category, priority, sentiment and starts the SLA clock.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
