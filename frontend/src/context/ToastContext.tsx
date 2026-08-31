import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../lib/format";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

const ToastContext = createContext<{ push: (tone: ToastTone, title: string, body?: string) => void } | null>(null);

const TONE = {
  success: { icon: CheckCircle2, ring: "border-emerald-200", accent: "text-emerald-600" },
  error: { icon: AlertTriangle, ring: "border-rose-400/40", accent: "text-rose-600" },
  info: { icon: Info, ring: "border-blush-200", accent: "text-plum-600" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, body?: string) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, tone, title, body }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => {
          const { icon: Icon, ring, accent } = TONE[toast.tone];
          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                "pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-lift",
                ring,
              )}
            >
              <Icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", accent)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-plum-800">{toast.title}</p>
                {toast.body && <p className="mt-0.5 break-words text-xs text-ink-500">{toast.body}</p>}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="rounded p-0.5 text-ink-400 transition hover:text-plum-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");

  return {
    success: (title: string, body?: string) => context.push("success", title, body),
    error: (title: string, body?: string) => context.push("error", title, body),
    info: (title: string, body?: string) => context.push("info", title, body),
  };
}
