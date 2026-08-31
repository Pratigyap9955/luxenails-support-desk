import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Mail, Phone, Plus, Search, Sparkles, Ticket as TicketIcon, Users } from "lucide-react";
import { api, qs } from "../lib/api";
import { money, timeAgo } from "../lib/format";
import {
  Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, LoadingBlock, Modal, SectionHeader, Select, Textarea,
} from "../components/ui";
import { TicketRowCompact } from "../components/TicketBits";
import { useToast } from "../context/ToastContext";
import { TIER_STYLE } from "../lib/tokens";
import type { Customer, Ticket, Tier } from "../lib/types";

const TIERS = Object.keys(TIER_STYLE) as Tier[];

export function CustomersPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [tier, setTier] = useState("all");
  const [sort, setSort] = useState("value");
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Deep link from a ticket ("view this customer") pre-fills the search.
  useEffect(() => {
    const incoming = params.get("search");
    if (incoming) setSearch(incoming);
  }, [params]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["customers", search, tier, sort],
    queryFn: () =>
      api.get<{ customers: Customer[]; pagination: { total: number } }>(
        `/customers${qs({ search, tier, sort, pageSize: 48 })}`,
      ),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-600 text-plum-800">Customers</h1>
          <p className="mt-1 text-sm text-ink-400">{data?.pagination.total ?? 0} client profiles</p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
          Add customer
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or phone…"
              className="field pl-9"
              aria-label="Search customers"
            />
          </div>
          <div className="w-36">
            <Select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filter by tier">
              <option value="all">All tiers</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>{TIER_STYLE[t].label}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort customers">
              <option value="value">Lifetime value</option>
              <option value="visits">Most visits</option>
              <option value="recent">Recently visited</option>
              <option value="name">Name</option>
            </Select>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <LoadingBlock rows={4} />
      ) : error ? (
        <ErrorState message={(error as Error).message} onRetry={refetch} />
      ) : data && data.customers.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.customers.map((customer) => (
            <Card key={customer.id} hover className="p-5">
              <button onClick={() => setSelected(customer.id)} className="w-full text-left">
                <div className="flex items-start gap-3">
                  <Avatar name={customer.name} hue={300 + (customer.name.length % 50)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-600 text-plum-800">
                      {customer.name}
                    </p>
                    <p className="truncate text-xs text-ink-400">{customer.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge className={TIER_STYLE[customer.tier].chip}>
                        {TIER_STYLE[customer.tier].label}
                      </Badge>
                      {customer.allergies && (
                        <Badge className="border-rose-400/40 bg-rose-500/10 text-rose-600">Allergy note</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-blush-100 pt-3 text-center">
                  <div>
                    <p className="font-display text-lg font-600 text-plum-800 tabular-nums">
                      {customer.totalVisits}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-ink-400">Visits</p>
                  </div>
                  <div>
                    <p className="font-display text-lg font-600 text-plum-800 tabular-nums">
                      {money(customer.lifetimeValue)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-ink-400">Value</p>
                  </div>
                  <div>
                    <p className="font-display text-lg font-600 text-plum-800 tabular-nums">
                      {customer._count?.tickets ?? 0}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-ink-400">Tickets</p>
                  </div>
                </div>

                {customer.tickets && customer.tickets.length > 0 && (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-rose-500">
                    <TicketIcon className="h-3 w-3" />
                    {customer.tickets.length} open
                  </p>
                )}
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No customers match"
          description="Try a different search, or add a client profile."
        />
      )}

      <CustomerDrawer id={selected} onClose={() => setSelected(null)} />
      <CreateCustomerModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

interface CustomerDetail {
  customer: Customer & { tickets: Ticket[] };
  stats: {
    totalTickets: number;
    openTickets: number;
    escalations: number;
    avgCsat: number | null;
    negativeSentimentCount: number;
  };
}

function CustomerDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.get<CustomerDetail>(`/customers/${id}`),
    enabled: !!id,
  });

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={data?.customer.name ?? "Customer"}
      description={data?.customer.email}
      width="max-w-3xl"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      {data ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={TIER_STYLE[data.customer.tier].chip}>
              {TIER_STYLE[data.customer.tier].label} member
            </Badge>
            {data.customer.tags.map((tag) => (
              <Badge key={tag} className="border-blush-200 bg-white text-ink-500">{tag}</Badge>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Visits", value: data.customer.totalVisits },
              { label: "Lifetime value", value: money(data.customer.lifetimeValue) },
              { label: "Tickets", value: data.stats.totalTickets },
              { label: "Avg CSAT", value: data.stats.avgCsat ?? "—" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-blush-100 bg-cream-50 px-3 py-2.5 text-center">
                <p className="font-display text-lg font-600 text-plum-800 tabular-nums">{stat.value}</p>
                <p className="text-[10px] uppercase tracking-wide text-ink-400">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {data.customer.phone && (
              <div className="flex items-center gap-2 text-sm text-ink-600">
                <Phone className="h-4 w-4 text-ink-400" /> {data.customer.phone}
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-ink-600">
              <Mail className="h-4 w-4 text-ink-400" /> {data.customer.email}
            </div>
            {data.customer.preferredTech && (
              <div className="flex items-center gap-2 text-sm text-ink-600">
                <Heart className="h-4 w-4 text-ink-400" /> Prefers {data.customer.preferredTech}
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-ink-600">
              <Sparkles className="h-4 w-4 text-ink-400" /> Last visit {timeAgo(data.customer.lastVisitAt)}
            </div>
          </div>

          {data.customer.allergies && (
            <div className="rounded-xl border border-rose-400/40 bg-rose-500/8 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-rose-600">Allergies & sensitivities</p>
              <p className="mt-1 text-sm text-ink-600">{data.customer.allergies}</p>
            </div>
          )}

          {data.customer.notes && (
            <div className="rounded-xl border border-blush-100 bg-cream-50 px-4 py-3">
              <p className="label">Notes</p>
              <p className="text-sm leading-relaxed text-ink-600">{data.customer.notes}</p>
            </div>
          )}

          <div>
            <SectionHeader
              title="Ticket history"
              subtitle={`${data.stats.openTickets} open · ${data.stats.escalations} escalated`}
            />
            {data.customer.tickets.length ? (
              <div className="-mx-1 space-y-0.5">
                {data.customer.tickets.map((ticket) => (
                  <TicketRowCompact key={ticket.id} ticket={{ ...ticket, customer: data.customer }} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-blush-200 px-4 py-6 text-center text-sm text-ink-400">
                No tickets yet.
              </p>
            )}
          </div>

          <Link
            to={`/tickets?search=${encodeURIComponent(data.customer.email)}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-500 hover:text-rose-600"
          >
            Open in ticket list →
          </Link>
        </div>
      ) : (
        <LoadingBlock rows={3} />
      )}
    </Modal>
  );
}

function CreateCustomerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "", email: "", phone: "", tier: "NEW" as Tier, notes: "", allergies: "",
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/customers", {
        ...form,
        phone: form.phone || null,
        notes: form.notes || null,
        allergies: form.allergies || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer added");
      setForm({ name: "", email: "", phone: "", tier: "NEW", notes: "", allergies: "" });
      onClose();
    },
    onError: (err: Error) => toast.error("Could not add customer", err.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add customer"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={create.isPending}
            disabled={form.name.trim().length < 2 || !form.email.includes("@")}
            onClick={() => create.mutate()}
          >
            Add customer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <Select label="Tier" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as Tier })}>
          {TIERS.map((t) => (
            <option key={t} value={t}>{TIER_STYLE[t].label}</option>
          ))}
        </Select>
        <Input
          label="Allergies"
          value={form.allergies}
          onChange={(e) => setForm({ ...form, allergies: e.target.value })}
          hint="Surfaced prominently on every ticket"
        />
        <Textarea label="Notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
    </Modal>
  );
}
