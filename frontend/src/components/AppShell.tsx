import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, BarChart3, Bell, BookOpen, Check, ChevronDown, Gauge, LayoutDashboard,
  LogOut, Menu, Settings, Sparkles, Ticket, Timer, Users, X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { cn, timeAgo } from "../lib/format";
import { Avatar, Badge } from "./ui";
import type { Notification, Overview } from "../lib/types";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/tickets", label: "Tickets", icon: Ticket, badge: "openTickets" as const },
  { to: "/triage", label: "AI Triage", icon: Sparkles, badge: "pendingDrafts" as const },
  { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/sla", label: "SLA Monitor", icon: Timer, badge: "breached" as const },
  { to: "/escalations", label: "Escalations", icon: AlertTriangle, badge: "escalationsOpen" as const },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const { user, runtime, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();

  // Route change closes every transient overlay.
  useEffect(() => {
    setMobileOpen(false);
    setBellOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  const { data: overview } = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.get<{ overview: Overview }>("/analytics/overview").then((r) => r.overview),
    refetchInterval: 30_000,
  });

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ notifications: Notification[]; unreadCount: number }>("/notifications?limit=15"),
    refetchInterval: 30_000,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const badgeCount = (key?: keyof Overview) => {
    if (!key || !overview) return 0;
    const value = overview[key];
    return typeof value === "number" ? value : 0;
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-plum-gradient text-lg shadow-soft">
          💅
        </span>
        <div className="min-w-0">
          <p className="font-display text-base font-700 leading-none tracking-[0.14em] text-plum-800">
            LUXENAILS
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">
            Client Care Desk
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {NAV.map((item) => {
          const count = badgeCount(item.badge);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
                  isActive
                    ? "bg-plum-gradient text-white shadow-soft"
                    : "text-ink-600 hover:bg-blush-50 hover:text-plum-700",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn("h-4.5 w-4.5 shrink-0", isActive ? "text-white" : "text-rose-400")} strokeWidth={2} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                        isActive ? "bg-white/25 text-white" : "bg-blush-200 text-plum-700",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {runtime?.demoMode && (
        <div className="mx-3 mb-3 rounded-xl border border-gold-300/60 bg-gold-300/15 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-plum-700">
            <Sparkles className="h-3 w-3" /> Demo Mode
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
            Running without API keys. AI and Slack use local engines.
          </p>
        </div>
      )}

      <div className="border-t border-blush-100 px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <Avatar name={user?.name ?? "?"} hue={user?.avatarHue} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-plum-800">{user?.name}</p>
            <p className="truncate text-[11px] text-ink-400">{user?.title ?? user?.role}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-blush-50 hover:text-rose-500"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const unread = notifications?.unreadCount ?? 0;

  return (
    <div className="flex min-h-screen bg-cream-100">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-blush-100 bg-white/80 backdrop-blur lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-plum-900/25 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-fade-up bg-white shadow-lift">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-5 rounded-lg p-1.5 text-ink-400 hover:bg-blush-50"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 border-b border-blush-100 bg-cream-100/85 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="rounded-xl border border-blush-200 bg-white p-2 text-plum-700 shadow-soft lg:hidden"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>

            <div className="hidden min-w-0 flex-1 sm:block">
              <p className="truncate font-display text-sm font-600 text-plum-700">
                {NAV.find((n) => (n.end ? n.to === location.pathname : location.pathname.startsWith(n.to)))?.label ??
                  "Client Care Desk"}
              </p>
            </div>

            <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
              {overview && (
                <div className="mr-1 hidden items-center gap-2 md:flex">
                  {overview.breached > 0 && (
                    <Badge className="border-rose-400/40 bg-rose-500/12 text-rose-600" dot="bg-rose-500">
                      {overview.breached} SLA breached
                    </Badge>
                  )}
                  {overview.urgent > 0 && (
                    <Badge className="border-blush-300 bg-blush-200 text-plum-800" dot="bg-rose-400">
                      {overview.urgent} urgent
                    </Badge>
                  )}
                </div>
              )}

              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setBellOpen((v) => !v)}
                  aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                  className={cn(
                    "relative rounded-xl border border-blush-200 bg-white p-2 text-plum-700 shadow-soft transition hover:border-blush-300",
                    unread > 0 && "animate-pulse-ring",
                  )}
                >
                  <Bell className="h-4.5 w-4.5" />
                  {unread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </button>

                {bellOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setBellOpen(false)} />
                    <div className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-fade-up overflow-hidden rounded-2xl border border-blush-100 bg-white shadow-lift">
                      <div className="flex items-center justify-between border-b border-blush-100 px-4 py-3">
                        <p className="font-display text-sm font-600 text-plum-800">Notifications</p>
                        {unread > 0 && (
                          <button
                            onClick={() => markAllRead.mutate()}
                            className="flex items-center gap-1 text-[11px] font-semibold text-rose-500 hover:text-rose-600"
                          >
                            <Check className="h-3 w-3" /> Mark all read
                          </button>
                        )}
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications?.notifications.length ? (
                          notifications.notifications.map((n) => (
                            <div
                              key={n.id}
                              className={cn(
                                "border-b border-blush-50 px-4 py-3 last:border-0",
                                !n.read && "bg-blush-50/50",
                              )}
                            >
                              <div className="flex items-start gap-2">
                                {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />}
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-plum-800">{n.title}</p>
                                  <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{n.body}</p>
                                  <p className="mt-1 text-[10px] uppercase tracking-wide text-ink-400">
                                    {timeAgo(n.createdAt)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="px-4 py-8 text-center text-sm text-ink-400">You're all caught up.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Account */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-xl border border-blush-200 bg-white py-1.5 pl-1.5 pr-2.5 shadow-soft transition hover:border-blush-300"
                >
                  <Avatar name={user?.name ?? "?"} hue={user?.avatarHue} size="xs" />
                  <span className="hidden text-xs font-semibold text-plum-800 sm:inline">
                    {user?.name.split(" ")[0]}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 z-20 mt-2 w-56 animate-fade-up overflow-hidden rounded-2xl border border-blush-100 bg-white shadow-lift">
                      <div className="border-b border-blush-100 px-4 py-3">
                        <p className="text-sm font-semibold text-plum-800">{user?.name}</p>
                        <p className="truncate text-xs text-ink-400">{user?.email}</p>
                        <Badge className="mt-2 border-blush-200 bg-blush-50 text-plum-700">{user?.role}</Badge>
                      </div>
                      <div className="p-2">
                        <NavLink
                          to="/settings"
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-blush-50"
                        >
                          <Settings className="h-4 w-4" /> Settings
                        </NavLink>
                        <button
                          onClick={logout}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-500/8"
                        >
                          <LogOut className="h-4 w-4" /> Sign out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>

        <footer className="border-t border-blush-100 px-4 py-4 text-center text-[11px] text-ink-400 sm:px-6">
          LUXENAILS Client Care Desk · {runtime?.demoMode ? "Demo Mode" : runtime?.aiModel} ·{" "}
          <span className="inline-flex items-center gap-1">
            <Gauge className="h-3 w-3" /> SLA monitor every {runtime?.slaScanIntervalSeconds ?? 60}s
          </span>
        </footer>
      </div>
    </div>
  );
}
