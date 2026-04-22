import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

export type ToastKind = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  detail?: string;
  duration: number;
}

interface ToastContextValue {
  push: (t: Omit<Toast, "id" | "duration"> & { duration?: number }) => void;
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
  warning: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * useToast() — push notifications from anywhere.
 * Call success/error/info/warning shortcuts, or push() for full control.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: TriangleAlert,
};

const STYLES: Record<ToastKind, string> = {
  success: "bg-emerald-50 border-emerald-200 text-emerald-900",
  error: "bg-rose-50 border-rose-200 text-rose-900",
  info: "bg-brand-50 border-brand-200 text-brand-900",
  warning: "bg-amber-50 border-amber-200 text-amber-900",
};

const ICON_COLOR: Record<ToastKind, string> = {
  success: "text-emerald-600",
  error: "text-rose-600",
  info: "text-brand-600",
  warning: "text-amber-600",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<ToastContextValue["push"]>(
    ({ duration = 4000, ...t }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { ...t, id, duration }]);
    },
    [],
  );

  const value: ToastContextValue = {
    push,
    success: (message, detail) => push({ kind: "success", message, detail }),
    error: (message, detail) => push({ kind: "error", message, detail, duration: 6000 }),
    info: (message, detail) => push({ kind: "info", message, detail }),
    warning: (message, detail) => push({ kind: "warning", message, detail, duration: 5000 }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, toast.duration);
    return () => clearTimeout(t);
  }, [onClose, toast.duration]);

  const Icon = ICONS[toast.kind];
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-lg animate-[slideIn_0.2s_ease-out]",
        STYLES[toast.kind],
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", ICON_COLOR[toast.kind])} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{toast.message}</div>
        {toast.detail && (
          <div className="mt-0.5 text-[11px] opacity-80 break-words">{toast.detail}</div>
        )}
      </div>
      <button
        onClick={onClose}
        className="rounded p-0.5 opacity-50 hover:opacity-100 shrink-0"
        aria-label="Đóng"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
