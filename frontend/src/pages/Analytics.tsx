import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { BarChart3, Sparkles, Table2, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import { cn, duration, percent } from "../lib/format";
import { Avatar, Badge, Button, Card, ErrorState, LoadingBlock, SectionHeader } from "../components/ui";
import {
  CATEGORY_LABEL, CHART_COLORS, CHART_SINGLE_HUE, PRIORITY_CHART_COLORS, SENTIMENT_CHART_COLORS,
} from "../lib/tokens";
import type { Category } from "../lib/types";

interface Analytics {
  range: { days: number; from: string; to: string };
  volume: { date: string; created: number; resolved: number; escalated: number }[];
  byCategory: { name: string; value: number }[];
  byPriority: { name: string; value: number }[];
  byChannel: { name: string; value: number }[];
  bySentiment: { name: string; value: number }[];
  byStatus: { name: string; value: number }[];
  agentStats: {
    id: string; name: string; avatarHue: number; role: string; assigned: number; resolved: number;
    open: number; avgFirstResponseMins: number; avgCsat: number | null; slaBreaches: number;
  }[];
  ai: {
    totalDrafts: number; approvedAsWritten: number; editedBeforeSending: number; rejected: number;
    pending: number; acceptanceRate: number; cleanApprovalRate: number; avgConfidence: number;
  };
  topArticles: { id: string; title: string; category: string; useCount: number; views: number }[];
}

const AXIS = { stroke: "#9C8791", fontSize: 11, fontFamily: "Manrope, sans-serif" };
const GRID = "#F5D5D8";

/** Shared tooltip so every chart reads the same way. */
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-blush-200 bg-white px-3 py-2 shadow-lift">
      {label && <p className="mb-1 text-[11px] font-semibold text-plum-800">{label}</p>}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-[11px]">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-ink-500">{entry.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-plum-800">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function AnalyticsPage() {
  const [days, setDays] = useState(14);
  const [showTable, setShowTable] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics", days],
    queryFn: () => api.get<{ analytics: Analytics }>(`/analytics?days=${days}`).then((r) => r.analytics),
  });

  if (isLoading) return <LoadingBlock rows={5} />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={refetch} />;
  if (!data) return null;

  const totalCreated = data.volume.reduce((acc, d) => acc + d.created, 0);
  const totalResolved = data.volume.reduce((acc, d) => acc + d.resolved, 0);

  const categoryData = data.byCategory.map((c) => ({
    ...c,
    label: CATEGORY_LABEL[c.name as Category] ?? c.name,
  }));

  // Severity order, not count order — a sequential ramp only reads correctly
  // when the bars run in the order the ramp encodes.
  const priorityData = (["URGENT", "HIGH", "MEDIUM", "LOW"] as const).map((name) => ({
    name: name.charAt(0) + name.slice(1).toLowerCase(),
    key: name,
    value: data.byPriority.find((p) => p.name === name)?.value ?? 0,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header + range filter (one row above the charts) */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-600 text-plum-800">Analytics</h1>
          <p className="mt-1 text-sm text-ink-400">
            {totalCreated} tickets opened and {totalResolved} resolved in the last {days} days
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl border border-blush-200 bg-white p-1 shadow-soft">
            {[7, 14, 30, 90].map((option) => (
              <button
                key={option}
                onClick={() => setDays(option)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  days === option ? "bg-plum-gradient text-white" : "text-ink-500 hover:text-plum-700",
                )}
              >
                {option}d
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            icon={<Table2 className="h-4 w-4" />}
            onClick={() => setShowTable((v) => !v)}
          >
            {showTable ? "Hide data" : "View data"}
          </Button>
        </div>
      </div>

      {/* AI performance — hero numbers, not charts */}
      <Card className="p-5">
        <SectionHeader
          title="AI assistance"
          subtitle="How often agents keep what the AI wrote"
          icon={<Sparkles className="h-4.5 w-4.5" />}
        />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div>
            <p className="font-display text-4xl font-600 leading-none text-plum-800 tabular-nums">
              {percent(data.ai.acceptanceRate, 1)}
            </p>
            <p className="mt-2 text-xs text-ink-400">
              Accepted — sent as written or after an edit
            </p>
          </div>
          <div>
            <p className="font-display text-4xl font-600 leading-none text-plum-800 tabular-nums">
              {percent(data.ai.cleanApprovalRate, 1)}
            </p>
            <p className="mt-2 text-xs text-ink-400">Sent completely unedited</p>
          </div>
          <div>
            <p className="font-display text-4xl font-600 leading-none text-plum-800 tabular-nums">
              {data.ai.totalDrafts}
            </p>
            <p className="mt-2 text-xs text-ink-400">
              Drafts generated · {data.ai.pending} awaiting review
            </p>
          </div>
          <div>
            <p className="font-display text-4xl font-600 leading-none text-plum-800 tabular-nums">
              {Math.round(data.ai.avgConfidence * 100)}%
            </p>
            <p className="mt-2 text-xs text-ink-400">Mean self-reported confidence</p>
          </div>
        </div>

        {/* Draft outcome breakdown — labelled, so identity is never colour-alone */}
        <div className="mt-5 border-t border-blush-100 pt-4">
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {[
              { label: "Approved as written", value: data.ai.approvedAsWritten, color: CHART_COLORS[2] },
              { label: "Edited then sent", value: data.ai.editedBeforeSending, color: CHART_COLORS[0] },
              { label: "Rejected", value: data.ai.rejected, color: "#B9AEB4" },
              { label: "Pending", value: data.ai.pending, color: CHART_COLORS[3] },
            ]
              .filter((segment) => segment.value > 0)
              .map((segment) => (
                <div
                  key={segment.label}
                  className="h-full"
                  style={{
                    background: segment.color,
                    flexGrow: segment.value,
                  }}
                  title={`${segment.label}: ${segment.value}`}
                />
              ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {[
              { label: "Approved as written", value: data.ai.approvedAsWritten, color: CHART_COLORS[2] },
              { label: "Edited then sent", value: data.ai.editedBeforeSending, color: CHART_COLORS[0] },
              { label: "Rejected", value: data.ai.rejected, color: "#B9AEB4" },
              { label: "Pending", value: data.ai.pending, color: CHART_COLORS[3] },
            ].map((segment) => (
              <span key={segment.label} className="flex items-center gap-1.5 text-[11px] text-ink-500">
                <span className="h-2 w-2 rounded-full" style={{ background: segment.color }} />
                {segment.label}
                <span className="font-semibold tabular-nums text-plum-800">{segment.value}</span>
              </span>
            ))}
          </div>
        </div>
      </Card>

      {/* Volume over time — 2 series, legend present */}
      <Card className="p-5">
        <SectionHeader
          title="Ticket volume"
          subtitle="Opened against resolved, by day"
          icon={<TrendingUp className="h-4.5 w-4.5" />}
        />
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.volume} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#EFBEC6", strokeWidth: 1 }} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, fontFamily: "Manrope, sans-serif", color: "#7A6470" }}
              />
              <Line
                type="monotone"
                dataKey="created"
                name="Opened"
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              />
              <Line
                type="monotone"
                dataKey="resolved"
                name="Resolved"
                stroke={CHART_COLORS[2]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Category — single series, one hue, no legend */}
        <Card className="p-5">
          <SectionHeader title="Tickets by category" subtitle={`Last ${days} days`} />
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 8 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#FDF2F2" }} />
                <Bar dataKey="value" name="Tickets" fill={CHART_SINGLE_HUE} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Priority — sequential severity ramp, labelled */}
        <Card className="p-5">
          <SectionHeader title="Tickets by priority" subtitle="Severity ramp, most to least urgent" />
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityData} margin={{ top: 4, right: 12, bottom: 4, left: -18 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#FDF2F2" }} />
                <Bar dataKey="value" name="Tickets" radius={[4, 4, 0, 0]} barSize={38}>
                  {priorityData.map((entry) => (
                    <Cell key={entry.key} fill={PRIORITY_CHART_COLORS[entry.key] ?? CHART_SINGLE_HUE} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Sentiment — diverging, negative to positive */}
        <Card className="p-5">
          <SectionHeader title="Sentiment mix" subtitle="Diverging: angry through delighted" />
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={["ANGRY", "FRUSTRATED", "NEUTRAL", "POSITIVE", "DELIGHTED"].map((name) => ({
                  name: name.charAt(0) + name.slice(1).toLowerCase(),
                  key: name,
                  value: data.bySentiment.find((s) => s.name === name)?.value ?? 0,
                }))}
                margin={{ top: 4, right: 12, bottom: 4, left: -18 }}
              >
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#FDF2F2" }} />
                <Bar dataKey="value" name="Tickets" radius={[4, 4, 0, 0]} barSize={34}>
                  {["ANGRY", "FRUSTRATED", "NEUTRAL", "POSITIVE", "DELIGHTED"].map((key) => (
                    <Cell key={key} fill={SENTIMENT_CHART_COLORS[key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Escalation trend — single series area */}
        <Card className="p-5">
          <SectionHeader title="Escalations raised" subtitle="Per day over the range" />
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.volume} margin={{ top: 4, right: 12, bottom: 4, left: -18 }}>
                <defs>
                  <linearGradient id="escGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_SINGLE_HUE} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CHART_SINGLE_HUE} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#EFBEC6", strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="escalated"
                  name="Escalated"
                  stroke={CHART_SINGLE_HUE}
                  strokeWidth={2}
                  fill="url(#escGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Agent performance */}
      <Card className="p-5">
        <SectionHeader
          title="Agent performance"
          subtitle="Assignment, throughput and SLA record"
          icon={<BarChart3 className="h-4.5 w-4.5" />}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-blush-100 text-left">
                {["Agent", "Assigned", "Resolved", "Open", "Avg first response", "CSAT", "SLA breaches"].map((head) => (
                  <th key={head} className="pb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.agentStats.map((agent) => (
                <tr key={agent.id} className="border-b border-blush-50 last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={agent.name} hue={agent.avatarHue} size="xs" />
                      <div>
                        <p className="font-semibold text-plum-800">{agent.name}</p>
                        <p className="text-[10px] uppercase tracking-wide text-ink-400">{agent.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 tabular-nums text-ink-600">{agent.assigned}</td>
                  <td className="py-3 font-semibold tabular-nums text-plum-800">{agent.resolved}</td>
                  <td className="py-3 tabular-nums text-ink-600">{agent.open}</td>
                  <td className="py-3 tabular-nums text-ink-600">
                    {agent.avgFirstResponseMins ? duration(agent.avgFirstResponseMins) : "—"}
                  </td>
                  <td className="py-3 tabular-nums text-ink-600">{agent.avgCsat ?? "—"}</td>
                  <td className="py-3">
                    {agent.slaBreaches > 0 ? (
                      <Badge className="border-rose-400/40 bg-rose-500/12 text-rose-600">
                        {agent.slaBreaches}
                      </Badge>
                    ) : (
                      <span className="text-ink-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Knowledge base usage */}
      <Card className="p-5">
        <SectionHeader title="Most-used knowledge" subtitle="Articles retrieved by the reply drafter" />
        <div className="space-y-2.5">
          {data.topArticles.map((article, index) => {
            const max = Math.max(...data.topArticles.map((a) => a.useCount), 1);
            return (
              <div key={article.id} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-right font-mono text-xs text-ink-400">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-plum-800">{article.title}</p>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-500">
                      {article.useCount}×
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-blush-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(article.useCount / max) * 100}%`, background: CHART_SINGLE_HUE }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Accessible table view of the chart data */}
      {showTable && (
        <Card className="p-5">
          <SectionHeader title="Underlying data" subtitle="Every chart above, as numbers" />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto">
              <p className="label">Daily volume</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-blush-100 text-left">
                    <th className="pb-2 text-xs uppercase tracking-wide text-ink-400">Date</th>
                    <th className="pb-2 text-xs uppercase tracking-wide text-ink-400">Opened</th>
                    <th className="pb-2 text-xs uppercase tracking-wide text-ink-400">Resolved</th>
                    <th className="pb-2 text-xs uppercase tracking-wide text-ink-400">Escalated</th>
                  </tr>
                </thead>
                <tbody>
                  {data.volume.map((row) => (
                    <tr key={row.date} className="border-b border-blush-50 last:border-0">
                      <td className="py-2 text-ink-600">{shortDate(row.date)}</td>
                      <td className="py-2 tabular-nums text-ink-600">{row.created}</td>
                      <td className="py-2 tabular-nums text-ink-600">{row.resolved}</td>
                      <td className="py-2 tabular-nums text-ink-600">{row.escalated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-6">
              {[
                { title: "By category", rows: categoryData.map((c) => ({ name: c.label, value: c.value })) },
                { title: "By priority", rows: priorityData },
                { title: "By channel", rows: data.byChannel },
              ].map((block) => (
                <div key={block.title}>
                  <p className="label">{block.title}</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {block.rows.map((row) => (
                        <tr key={row.name} className="border-b border-blush-50 last:border-0">
                          <td className="py-1.5 text-ink-600">{row.name}</td>
                          <td className="py-1.5 text-right font-semibold tabular-nums text-plum-800">
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
