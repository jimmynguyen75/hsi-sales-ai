import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  hints?: string[];
  className?: string;
  /** "card" (default) wraps in a bordered card. "inline" is borderless. */
  variant?: "card" | "inline";
}

/**
 * Standard empty-state block. Use for modules that haven't been populated yet.
 * Prefer over plain "Chưa có X" text — gives users a clear next step.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  hints,
  className,
  variant = "card",
}: EmptyStateProps) {
  const content = (
    <div className={cn("flex flex-col items-center text-center py-10 px-6", className)}>
      <div className="h-14 w-14 rounded-full bg-brand-50 text-brand-500 grid place-items-center mb-3">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-slate-500 max-w-md">{description}</p>
      )}
      {hints && hints.length > 0 && (
        <ul className="mt-4 text-left text-xs text-slate-600 space-y-1.5 max-w-md">
          {hints.map((h, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-brand-500 shrink-0">•</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );

  if (variant === "inline") return content;
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white">
      {content}
    </div>
  );
}
