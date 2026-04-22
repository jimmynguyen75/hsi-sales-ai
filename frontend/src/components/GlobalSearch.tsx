import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Briefcase,
  CalendarDays,
  FilePlus,
  FileSpreadsheet,
  Swords,
  FileText,
  Search,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type HitType = "account" | "deal" | "meeting" | "proposal" | "quotation" | "competitor" | "rfp";
interface SearchHit {
  type: HitType;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}
interface SearchResponse {
  hits: SearchHit[];
  query: string;
}

const ICON: Record<HitType, typeof Building2> = {
  account: Building2,
  deal: Briefcase,
  meeting: CalendarDays,
  proposal: FilePlus,
  quotation: FileSpreadsheet,
  competitor: Swords,
  rfp: FileText,
};

const LABEL: Record<HitType, string> = {
  account: "Khách hàng",
  deal: "Deal",
  meeting: "Meeting",
  proposal: "Proposal",
  quotation: "Báo giá",
  competitor: "Đối thủ",
  rfp: "RFP",
};

const TYPE_COLOR: Record<HitType, string> = {
  account: "text-brand-600 bg-brand-50",
  deal: "text-emerald-700 bg-emerald-50",
  meeting: "text-indigo-700 bg-indigo-50",
  proposal: "text-amber-700 bg-amber-50",
  quotation: "text-cyan-700 bg-cyan-50",
  competitor: "text-rose-700 bg-rose-50",
  rfp: "text-violet-700 bg-violet-50",
};

/**
 * Global header search. Debounced 200ms, cross-entity.
 * Keyboard: ⌘/Ctrl+K focuses, ArrowUp/Down navigates, Enter opens, Esc closes.
 */
export function GlobalSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside to close
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () =>
      api.get<SearchResponse>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 10_000,
  });

  const hits = data?.hits ?? [];

  // Reset active row when results change
  useEffect(() => {
    setActiveIdx(0);
  }, [hits.length, debounced]);

  function go(hit: SearchHit) {
    nav(hit.url);
    setOpen(false);
    setQ("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIdx];
      if (hit) go(hit);
    }
  }

  const showPanel = open && debounced.length >= 2;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Tìm account, deal, meeting, proposal…"
        className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-14 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">
        ⌘K
      </kbd>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>{hits.length} kết quả</span>
            {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          {!isFetching && hits.length === 0 && (
            <div className="px-4 py-6 text-sm text-slate-500 text-center">
              Không có kết quả cho "{debounced}".
            </div>
          )}
          {hits.map((h, i) => {
            const Icon = ICON[h.type];
            return (
              <button
                key={`${h.type}-${h.id}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => go(h)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left transition",
                  i === activeIdx ? "bg-brand-50" : "hover:bg-slate-50",
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 shrink-0 rounded-md grid place-items-center",
                    TYPE_COLOR[h.type],
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{h.title}</div>
                  {h.subtitle && (
                    <div className="truncate text-[11px] text-slate-500">{h.subtitle}</div>
                  )}
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-400">
                  {LABEL[h.type]}
                </span>
              </button>
            );
          })}
          {hits.length > 0 && (
            <div className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400 flex items-center justify-between">
              <span>↑↓ để chọn · Enter để mở · Esc để đóng</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
