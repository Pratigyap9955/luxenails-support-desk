export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/** "just now" · "12m ago" · "3h ago" · "5 Feb" */
export function timeAgo(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const date = typeof input === "string" ? new Date(input) : input;
  const diff = Date.now() - date.getTime();

  if (diff < 45_000) return "just now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Signed countdown for SLA clocks: "1h 12m left" / "42m overdue". */
export function countdown(ms: number | null | undefined): { text: string; overdue: boolean } {
  if (ms === null || ms === undefined) return { text: "—", overdue: false };
  const overdue = ms < 0;
  const total = Math.abs(ms);

  const days = Math.floor(total / 86_400_000);
  const hours = Math.floor((total % 86_400_000) / 3_600_000);
  const mins = Math.floor((total % 3_600_000) / 60_000);
  const secs = Math.floor((total % 60_000) / 1000);

  let text: string;
  if (days > 0) text = `${days}d ${hours}h`;
  else if (hours > 0) text = `${hours}h ${mins}m`;
  else if (mins > 0) text = `${mins}m ${secs}s`;
  else text = `${secs}s`;

  return { text: overdue ? `${text} overdue` : `${text} left`, overdue };
}

/** Minutes as a human duration: 15m, 4h, 1d 4h */
export function duration(mins: number | null | undefined): string {
  if (mins === null || mins === undefined) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${Math.round(mins % 60)}m`.replace(" 0m", "");
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`.replace(" 0h", "");
}

export const money = (value: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);

export const dateTime = (input: string | Date | null | undefined) =>
  input
    ? new Date(input).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Turns SCREAMING_SNAKE enums into "Screaming snake". */
export const humanise = (value: string) => {
  const lower = value.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

export const percent = (value: number, digits = 0) => `${value.toFixed(digits)}%`;
