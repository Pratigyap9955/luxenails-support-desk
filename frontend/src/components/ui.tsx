import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";
import { cn, initials } from "../lib/format";

// ─────────────────────────── Button ───────────────────────────

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-plum-gradient text-white shadow-soft hover:shadow-lift hover:brightness-110 active:brightness-95 border border-transparent",
  secondary:
    "bg-white text-plum-700 border border-blush-200 hover:border-blush-300 hover:bg-blush-50 shadow-soft",
  ghost: "bg-transparent text-ink-600 border border-transparent hover:bg-blush-50 hover:text-plum-700",
  danger: "bg-rose-500 text-white border border-transparent hover:bg-rose-600 shadow-soft",
  gold: "bg-gold-400 text-plum-800 border border-gold-500 hover:bg-gold-300 shadow-soft",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2.5 rounded-xl",
  icon: "h-9 w-9 rounded-xl",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition-all duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-soft",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ─────────────────────────── Surfaces ───────────────────────────

export function Card({
  className,
  children,
  hover,
}: {
  className?: string;
  children: ReactNode;
  hover?: boolean;
}) {
  return <div className={cn("card", hover && "card-hover", className)}>{children}</div>;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon && <span className="text-rose-500">{icon}</span>}
        <div>
          <h2 className="font-display text-lg font-600 leading-tight text-plum-800">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ─────────────────────────── Badge ───────────────────────────

export function Badge({
  children,
  className,
  dot,
}: {
  children: ReactNode;
  className?: string;
  dot?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none",
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
      {children}
    </span>
  );
}

// ─────────────────────────── Form fields ───────────────────────────

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }>(
  function Input({ label, hint, className, id, ...props }, ref) {
    return (
      <div className="w-full">
        {label && (
          <label className="label" htmlFor={id}>
            {label}
          </label>
        )}
        <input ref={ref} id={id} className={cn("field", className)} {...props} />
        {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
      </div>
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }
>(function Textarea({ label, hint, className, id, ...props }, ref) {
  return (
    <div className="w-full">
      {label && (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      )}
      <textarea ref={ref} id={id} className={cn("field resize-y leading-relaxed", className)} {...props} />
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
});

export function Select({
  label,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <select
        className={cn("field cursor-pointer appearance-none bg-[right_0.75rem_center] bg-no-repeat pr-9", className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%239C8791' d='M1 1l5 5 5-5'/%3E%3C/svg%3E\")",
        }}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

// ─────────────────────────── Avatar ───────────────────────────

export function Avatar({
  name,
  hue = 330,
  size = "md",
  className,
}: {
  name: string;
  hue?: number;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-lg",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white",
        sizes[size],
        className,
      )}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 44% 52%), hsl(${hue + 18} 40% 38%))` }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

// ─────────────────────────── Feedback ───────────────────────────

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-rose-400", className)} />;
}

export function LoadingBlock({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" aria-label={label} role="status">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-16 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-blush-200 bg-cream-50/60 px-6 py-14 text-center">
      {icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blush-100 text-rose-400">
          {icon}
        </span>
      )}
      <p className="font-display text-base font-600 text-plum-700">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-400/30 bg-rose-500/5 px-5 py-4">
      <p className="text-sm font-semibold text-rose-600">Something went wrong</p>
      <p className="mt-1 text-sm text-ink-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// ─────────────────────────── Modal ───────────────────────────

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
      <div
        className="fixed inset-0 bg-plum-900/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 w-full animate-fade-up rounded-t-3xl bg-white shadow-lift sm:rounded-2xl",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-blush-100 px-5 py-4 sm:px-6">
          <div>
            <h3 className="font-display text-lg font-600 text-plum-800">{title}</h3>
            {description && <p className="mt-0.5 text-sm text-ink-400">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-blush-50 hover:text-plum-700"
          >
            <X className="h-4.5 w-4.5" strokeWidth={2} />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-blush-100 bg-cream-50 px-5 py-4 sm:rounded-b-2xl sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Meters ───────────────────────────

export function ProgressBar({
  value,
  className,
  barClassName,
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-blush-100", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", barClassName ?? "bg-rose-400")}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** Confidence readout used wherever the AI reports a score. */
export function ConfidenceMeter({ value, label = "confidence" }: { value: number; label?: string }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 75 ? "bg-emerald-500" : pct >= 55 ? "bg-gold-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-blush-100">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-ink-500">
        {pct}% {label}
      </span>
    </div>
  );
}
