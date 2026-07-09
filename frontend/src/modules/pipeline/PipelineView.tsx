/**
 * Sales Pipeline — Kanban view of all deals grouped by stage.
 *
 * One column per stage, scroll horizontally on narrow screens. No drag-drop
 * (react-dnd/dnd-kit would pull in 40kb+) — instead each card has a stage
 * dropdown that PUTs to /api/deals/:id. That's one more click than drag but
 * accessible and robust.
 *
 * Each card also has inline edit (opens DealDialog in edit mode) and delete
 * (admin only, matching backend RBAC). The dialog is hoisted to this
 * component so one mount handles every card.
 *
 * Top bar: total pipeline value (sum of open deals), forecast (Vàng + Hồng)
 * (sum of value × probability/100 for open deals), plus vendor/owner filters.
 * "Open" = everything except closed_won / closed_lost.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Target,
  Filter,
  TrendingUp,
  Trophy,
  ExternalLink,
  Pencil,
  Trash2,
  Search,
  LayoutGrid,
  List as ListIcon,
  ArrowUpDown,
  User as UserIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Deal, User } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatVND, formatVNDShort, formatDate, stageColor } from "@/lib/format";
import { cn } from "@/lib/cn";
import { DealDialog } from "@/modules/crm/DealDialog";

// HPT OPP color convention — 5 buckets. See lib/format.ts stageColor().
type StageKey = "red" | "yellow" | "green" | "pink" | "gray";

const STAGES: Array<{ key: StageKey; label: string; hint: string }> = [
  { key: "red",    label: "Đỏ",   hint: "Chưa đủ điều kiện" },
  { key: "yellow", label: "Vàng", hint: "Thiếu ngân sách / tiến độ" },
  { key: "green",  label: "Xanh", hint: "Thoả tất cả tiêu chí" },
  { key: "pink",   label: "Hồng", hint: "Đã ký hợp đồng" },
  { key: "gray",   label: "Xám",  hint: "Không tiếp cận được" },
];

// Legacy stage names still coming from unmigrated deals — map to color keys.
const LEGACY_STAGE_MAP: Record<string, StageKey> = {
  prospecting: "red",
  qualification: "yellow",
  proposal: "green",
  negotiation: "green",
  closed_won: "pink",
  closed_lost: "gray",
};
const normalizeStage = (s: string): StageKey =>
  (STAGES.find((x) => x.key === s)?.key ?? LEGACY_STAGE_MAP[s] ?? "red");

// "Open" pipeline for KPIs = still in play (not pink/gray).
const OPEN_STAGES: StageKey[] = ["red", "yellow", "green"];

const VENDORS = ["HPE", "Dell", "IBM", "Palo Alto", "CrowdStrike", "Microsoft", "Other"];

export function PipelineView() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canDelete = user?.role === "admin";
  const isAdmin = user?.role === "admin";
  const [vendor, setVendor] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [search, setSearch] = useState("");
  // Color/stage filter — Set of active colors. Empty = show all.
  // Sales rep can click a chip to toggle; multi-select lets them pick
  // "Đỏ + Vàng" (all open early-stage) without a dropdown click chain.
  const [stageFilter, setStageFilter] = useState<Set<StageKey>>(new Set());
  const toggleStage = (k: StageKey) => {
    setStageFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };
  // View mode persists in localStorage — reps who prefer table stay in
  // table across sessions. Default "list" since a busy Đỏ column reads
  // better as a sortable table (per user feedback).
  const [viewMode, setViewMode] = useState<"board" | "list">(() => {
    try {
      const v = localStorage.getItem("pipeline:view");
      return v === "board" || v === "list" ? v : "list";
    } catch {
      return "list";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("pipeline:view", viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  const { data: deals, isLoading } = useQuery({
    queryKey: ["deals", { vendor }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (vendor) p.set("vendor", vendor);
      return api.get<Deal[]>(`/deals?${p.toString()}`);
    },
  });

  // Admin-only: fetch the team list for the owner filter dropdown. Backend
  // guards /users with requireRole("admin"), so sales never hit this.
  const { data: teamUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<User[]>("/users"),
    enabled: isAdmin,
  });

  // Move deal to another stage. Optimistic update keeps the UI responsive.
  const moveMut = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: StageKey }) =>
      api.put(`/deals/${id}`, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.del(`/deals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  // Owner + search filters applied client-side. Server already scopes deals
  // by owner (RBAC); admins can further narrow by picking a sales rep, and
  // any user can text-search across account name + deal title + vendor.
  const filteredDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesSearch = (d: Deal) => {
      if (!q) return true;
      const haystack =
        `${d.title} ${d.account?.companyName ?? ""} ${d.vendor ?? ""}`.toLowerCase();
      return haystack.includes(q);
    };
    return (deals ?? []).filter(
      (d) =>
        (!ownerFilter || d.ownerId === ownerFilter || d.owner?.id === ownerFilter) &&
        (stageFilter.size === 0 || stageFilter.has(normalizeStage(d.stage))) &&
        matchesSearch(d),
    );
  }, [deals, ownerFilter, search, stageFilter]);

  const grouped = useMemo(() => {
    const g: Record<StageKey, Deal[]> = {
      red: [],
      yellow: [],
      green: [],
      pink: [],
      gray: [],
    };
    for (const d of filteredDeals) {
      const s = normalizeStage(d.stage);
      g[s].push(d);
    }
    return g;
  }, [filteredDeals]);

  const stats = useMemo(() => {
    const open = filteredDeals.filter((d) => OPEN_STAGES.includes(normalizeStage(d.stage)));
    const totalValue = open.reduce((s, d) => s + (d.value ?? 0), 0);
    // Company forecast rule: OPP Vàng (sắp ký) + OPP Hồng (đã ký).
    const forecast = filteredDeals
      .filter((d) => ["yellow", "pink"].includes(normalizeStage(d.stage)))
      .reduce((s, d) => s + (d.value ?? 0), 0);
    const won = filteredDeals
      .filter((d) => normalizeStage(d.stage) === "pink")
      .reduce((s, d) => s + (d.value ?? 0), 0);
    return { openCount: open.length, totalValue, forecast, won };
  }, [filteredDeals]);

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* Header — white "working page" style with a violet icon tile + the
          five OPP color dots as a signature strip, distinct from Dashboard. */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Top rainbow strip = the 5 OPP colors, the identity of this page */}
        <div className="flex h-1.5 w-full">
          <div className="flex-1 bg-rose-500" />
          <div className="flex-1 bg-amber-400" />
          <div className="flex-1 bg-emerald-500" />
          <div className="flex-1 bg-pink-400" />
          <div className="flex-1 bg-slate-300" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-200">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Sales Pipeline FY2026</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Cơ hội theo màu OPP — Đỏ · Vàng · Xanh · Hồng · Xám
              </p>
            </div>
          </div>
          <div className="text-right rounded-lg bg-slate-50 border border-slate-100 px-4 py-2">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
              Tổng giá trị
            </div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">
              {formatVNDShort(
                filteredDeals.reduce((s, d) => s + (d.value ?? 0), 0),
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Briefcase className="h-5 w-5" />}
          label="Deal đang mở"
          value={stats.openCount.toString()}
          tone="blue"
        />
        <StatCard
          icon={<Target className="h-5 w-5" />}
          label="Tổng pipeline mở"
          value={formatVNDShort(stats.totalValue)}
          tone="blue"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Forecast"
          value={formatVNDShort(stats.forecast)}
          tone="violet"
          hint="OPP Vàng + OPP Hồng"
        />
        <StatCard
          icon={<Trophy className="h-5 w-5" />}
          label="Đã ký hợp đồng"
          value={formatVNDShort(stats.won)}
          tone="emerald"
        />
      </div>

      {/* Filter bar — search on the left, filters + view toggle on the right */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-[380px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm khách hàng, dự án, vendor..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Filter className="h-3.5 w-3.5 text-slate-400 ml-1" />
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs"
          >
            <option value="">Mọi vendor</option>
            {VENDORS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          {isAdmin && (
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs"
              title="Lọc theo sales owner"
            >
              <option value="">Mọi sales</option>
              {(teamUsers ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.role === "admin" ? "(admin)" : ""}
                </option>
              ))}
            </select>
          )}
          {(vendor || ownerFilter || search || stageFilter.size > 0) && (
            <button
              onClick={() => {
                setVendor("");
                setOwnerFilter("");
                setSearch("");
                setStageFilter(new Set());
              }}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              xoá lọc
            </button>
          )}
          {/* View toggle — Board (kanban) vs List (table). Persists in
              localStorage so the rep's preference sticks. */}
          <div className="ml-auto inline-flex rounded-md border border-slate-300 bg-white text-xs">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-l-md transition",
                viewMode === "list"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
              title="Bảng — sortable table"
            >
              <ListIcon className="h-3.5 w-3.5" />
              List
            </button>
            <button
              onClick={() => setViewMode("board")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-r-md transition border-l border-slate-300",
                viewMode === "board"
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
              title="Kanban 5 cột theo màu OPP"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Board
            </button>
          </div>
          <div className="text-[11px] text-slate-400">
            {isLoading
              ? "Đang tải..."
              : (search || ownerFilter || vendor || stageFilter.size > 0)
                ? `${filteredDeals.length} / ${deals?.length ?? 0} deals`
                : `${deals?.length ?? 0} deals`}
          </div>
        </div>
        {/* Color chip toggles — one per HPT OPP color. Multi-select
            (Đỏ + Vàng together = all open early-stage). Empty = show all.
            Each chip shows count of deals in that color from the current
            server dataset (before this filter is applied). */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          <span className="text-[11px] text-slate-500 mr-1">Màu:</span>
          {STAGES.map((s) => {
            const active = stageFilter.has(s.key);
            const total = (deals ?? []).filter(
              (d) => normalizeStage(d.stage) === s.key,
            ).length;
            return (
              <button
                key={s.key}
                onClick={() => toggleStage(s.key)}
                title={s.hint}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition",
                  active
                    ? stageColor(s.key) + " ring-2 ring-offset-1 ring-brand-500/40"
                    : stageColor(s.key) + " opacity-60 hover:opacity-100",
                )}
              >
                <span>{s.label}</span>
                <span className="text-[10px] opacity-70">({total})</span>
              </button>
            );
          })}
          {stageFilter.size > 0 && (
            <button
              onClick={() => setStageFilter(new Set())}
              className="text-[11px] text-slate-500 hover:text-slate-800 underline ml-1"
            >
              bỏ chọn
            </button>
          )}
        </div>
      </Card>

      {/* Body — either Kanban board or List table depending on viewMode. */}
      {viewMode === "list" ? (
        <DealListView
          deals={filteredDeals}
          showOwner={isAdmin}
          onEdit={(d) => setEditDeal(d)}
          onChangeStage={(id, newStage) => moveMut.mutate({ id, stage: newStage })}
          onDelete={canDelete ? (d) => {
            if (confirm(`Xoá deal "${d.title}"?`)) delMut.mutate(d.id);
          } : undefined}
        />
      ) : (
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {STAGES.map((s) => (
            <KanbanColumn
              key={s.key}
              stage={s}
              deals={grouped[s.key]}
              showOwner={isAdmin}
              onChangeStage={(id, newStage) => moveMut.mutate({ id, stage: newStage })}
              onEdit={(d) => setEditDeal(d)}
              onDelete={
                canDelete
                  ? (d) => {
                      if (confirm(`Xoá deal "${d.title}"?`)) delMut.mutate(d.id);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
      )}

      {/* Edit dialog — hoisted so one mount handles every card */}
      <DealDialog
        open={!!editDeal}
        accountId={editDeal?.accountId ?? ""}
        deal={editDeal}
        onClose={() => setEditDeal(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["deals"] })}
      />
    </div>
  );
}

/**
 * DealListView — sortable table. Better than a kanban when 1 stage (Đỏ
 * currently) has ~15+ cards. Every row is 1 deal; users sort/scan the
 * whole pipeline in a single view.
 */
type SortKey = "stage" | "account" | "title" | "value" | "expectedClose" | "vendor";
type SortDir = "asc" | "desc";

function DealListView({
  deals,
  showOwner,
  onEdit,
  onChangeStage,
  onDelete,
}: {
  deals: Deal[];
  showOwner: boolean;
  onEdit: (d: Deal) => void;
  onChangeStage: (id: string, newStage: StageKey) => void;
  onDelete?: (d: Deal) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // Group order = stage priority when sorting by stage.
  const STAGE_ORDER: Record<string, number> = {
    red: 0, prospecting: 0,
    yellow: 1, qualification: 1,
    green: 2, proposal: 2, negotiation: 2,
    pink: 3, closed_won: 3,
    gray: 4, closed_lost: 4,
  };
  const sorted = useMemo(() => {
    const arr = [...deals];
    arr.sort((a, b) => {
      let av: number | string = "";
      let bv: number | string = "";
      switch (sortKey) {
        case "stage":
          av = STAGE_ORDER[a.stage] ?? 99;
          bv = STAGE_ORDER[b.stage] ?? 99;
          break;
        case "account":
          av = a.account?.companyName ?? "";
          bv = b.account?.companyName ?? "";
          break;
        case "title":
          av = a.title;
          bv = b.title;
          break;
        case "value":
          av = a.value ?? 0;
          bv = b.value ?? 0;
          break;
        case "expectedClose":
          av = a.expectedClose ? +new Date(a.expectedClose) : 0;
          bv = b.expectedClose ? +new Date(b.expectedClose) : 0;
          break;
        case "vendor":
          av = a.vendor ?? "";
          bv = b.vendor ?? "";
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [deals, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "value" || k === "expectedClose" ? "desc" : "asc");
    }
  }

  const totalValue = sorted.reduce((s, d) => s + (d.value ?? 0), 0);

  const SortHead = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={cn(
        "cursor-pointer select-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800",
        right ? "text-right" : "text-left",
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k ? (
          <span className="text-brand-600">{sortDir === "asc" ? "↑" : "↓"}</span>
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-300" />
        )}
      </span>
    </th>
  );

  return (
    <Card className="overflow-hidden">
      <div className="max-h-[75vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <SortHead k="stage">Màu</SortHead>
              <SortHead k="account">Khách hàng</SortHead>
              <SortHead k="title">Dự án</SortHead>
              <SortHead k="vendor">Vendor</SortHead>
              <SortHead k="value" right>Giá trị</SortHead>
              <SortHead k="expectedClose">Ký HĐ</SortHead>
              {showOwner && (
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sales</th>
              )}
              <th className="w-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={showOwner ? 8 : 7} className="px-3 py-12 text-center text-sm text-slate-400">
                  Không có deal nào khớp bộ lọc.
                </td>
              </tr>
            )}
            {sorted.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50 transition group">
                <td className="px-3 py-2">
                  {/* Stage cell = clickable select styled as a color badge.
                      Click to change stage without opening the dialog. */}
                  <select
                    value={normalizeStage(d.stage)}
                    onChange={(e) => onChangeStage(d.id, e.target.value as StageKey)}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "text-[11px] rounded-md border px-1.5 py-0.5 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-500",
                      stageColor(d.stage),
                    )}
                    title={STAGES.find((s) => s.key === normalizeStage(d.stage))?.hint}
                  >
                    {STAGES.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  {d.account ? (
                    <Link
                      to={`/crm/${d.account.id}`}
                      className="text-slate-800 hover:text-brand-600 font-medium"
                      title={d.account.companyName}
                    >
                      <span className="line-clamp-1">{d.account.companyName}</span>
                    </Link>
                  ) : (
                    <span className="text-slate-400 italic">— chưa gắn —</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  <span className="line-clamp-1" title={d.title}>{d.title}</span>
                </td>
                <td className="px-3 py-2 text-slate-600 text-xs">
                  {d.vendor ?? "—"}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                  {formatVND(d.value)}
                  {d.probability != null && (
                    <div className="text-[10px] text-slate-400 font-normal">
                      {d.probability}%
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600 text-xs whitespace-nowrap">
                  {d.expectedClose ? formatDate(d.expectedClose) : "—"}
                </td>
                {showOwner && (
                  <td className="px-3 py-2 text-slate-600 text-xs">
                    {d.owner?.name ?? "—"}
                  </td>
                )}
                <td className="px-2 py-2">
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => onEdit(d)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Sửa"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {onDelete && (
                      <button
                        onClick={() => onDelete(d)}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Xoá"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {d.account && (
                      <Link
                        to={`/crm/${d.account.id}`}
                        title="Mở account"
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {sorted.length > 0 && (
            <tfoot className="bg-slate-50 border-t border-slate-200 sticky bottom-0">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-xs text-slate-600">
                  <span className="font-medium">{sorted.length} deals</span> hiển thị
                </td>
                <td className="px-3 py-2 text-right font-bold text-slate-900 tabular-nums">
                  {formatVND(totalValue)}
                </td>
                <td colSpan={showOwner ? 3 : 2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

function KanbanColumn({
  stage,
  deals,
  showOwner,
  onChangeStage,
  onEdit,
  onDelete,
}: {
  stage: { key: StageKey; label: string; hint?: string };
  deals: Deal[];
  showOwner: boolean;
  onChangeStage: (id: string, newStage: StageKey) => void;
  onEdit: (d: Deal) => void;
  onDelete?: (d: Deal) => void;
}) {
  // Sort deals by value desc — highest-priority ones stay above the fold
  // when a column has 15+ cards (e.g. current Đỏ column with 16 items).
  const sortedDeals = useMemo(
    () =>
      [...deals].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    [deals],
  );
  const total = deals.reduce((s, d) => s + (d.value ?? 0), 0);

  // Per-color accent for the column: top border stripe + tinted body bg.
  const ACCENT: Record<StageKey, { bar: string; body: string }> = {
    red: { bar: "bg-rose-500", body: "bg-rose-50/60" },
    yellow: { bar: "bg-amber-400", body: "bg-amber-50/60" },
    green: { bar: "bg-emerald-500", body: "bg-emerald-50/60" },
    pink: { bar: "bg-pink-400", body: "bg-pink-50/60" },
    gray: { bar: "bg-slate-300", body: "bg-slate-100/70" },
  };
  const accent = ACCENT[stage.key];

  return (
    <div className="w-72 shrink-0 flex flex-col">
      {/* Column header — count pill + total, colored accent bar above. */}
      <div className={cn("h-1 rounded-t-lg", accent.bar)} />
      <div className="mb-2 px-2 pt-2 pb-1 bg-white border-x border-slate-200 rounded-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={stageColor(stage.key)}>{stage.label}</Badge>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">
              {deals.length}
            </span>
          </div>
          {deals.length > 0 && (
            <div className="text-xs font-semibold text-slate-700 tabular-nums">
              {formatVNDShort(total)}
            </div>
          )}
        </div>
        {stage.hint && (
          <div className="mt-0.5 text-[10px] text-slate-400 truncate" title={stage.hint}>
            {stage.hint}
          </div>
        )}
      </div>
      {/* Column body — scrolls independently at ~70vh so a busy column
          doesn't push the page taller than the viewport. */}
      <div
        className={cn(
          "rounded-b-lg p-2 space-y-1.5 overflow-y-auto scrollbar-thin border-x border-b border-slate-200",
          accent.body,
        )}
        style={{ maxHeight: "68vh", minHeight: "220px" }}
      >
        {sortedDeals.length === 0 ? (
          <div className="text-[11px] text-slate-400 text-center py-6">— trống —</div>
        ) : (
          sortedDeals.map((d) => (
            <DealCard
              key={d.id}
              deal={d}
              showOwner={showOwner}
              onChangeStage={onChangeStage}
              onEdit={() => onEdit(d)}
              onDelete={onDelete ? () => onDelete(d) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DealCard({
  deal,
  showOwner,
  onChangeStage,
  onEdit,
  onDelete,
}: {
  deal: Deal;
  showOwner: boolean;
  onChangeStage: (id: string, newStage: StageKey) => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  // Compact card: 3 rows total (title, account+value, footer meta+select).
  // Height dropped from ~120px to ~74px so a Đỏ column with 16 items fits
  // ~6 cards visible without scrolling.
  return (
    <div className="group rounded-md bg-white border border-slate-200 px-2 py-1.5 shadow-sm hover:shadow hover:border-slate-300 transition">
      {/* Row 1: title + hover actions */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div
            className="font-medium text-[12.5px] text-slate-800 line-clamp-1 leading-snug"
            title={deal.title}
          >
            {deal.title}
          </div>
          {deal.account && (
            <div className="text-[10.5px] text-slate-500 truncate">
              {deal.account.companyName}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={onEdit}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Sửa"
          >
            <Pencil className="h-3 w-3" />
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              title="Xoá"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          {deal.account && (
            <Link
              to={`/crm/${deal.account.id}`}
              title={`Mở account ${deal.account.companyName}`}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
            >
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Row 2: value + probability + vendor + expected close (single line) */}
      <div className="mt-1 flex items-center justify-between gap-1.5">
        <div className="text-[13px] font-semibold text-slate-900 tabular-nums truncate">
          {formatVND(deal.value)}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
          {deal.vendor && (
            <span className="truncate max-w-[60px]" title={deal.vendor}>
              {deal.vendor}
            </span>
          )}
          {deal.expectedClose && (
            <span className="whitespace-nowrap">· {formatDate(deal.expectedClose)}</span>
          )}
        </div>
      </div>

      {/* Row 3 (only when needed): owner chip for admin. Hidden by default
          — most sales users don't need to see themselves on every card. */}
      {showOwner && deal.owner && (
        <div className="mt-1 inline-flex items-center gap-1 rounded bg-slate-50 border border-slate-200 px-1 py-0.5 text-[9.5px] text-slate-600">
          <UserIcon className="h-2.5 w-2.5" />
          {deal.owner.name}
        </div>
      )}

      {/* Stage select — hidden until hover to reduce visual noise. Change
          stage by click. */}
      <div className="mt-1 opacity-70 group-hover:opacity-100 transition">
        <select
          value={normalizeStage(deal.stage)}
          onChange={(e) => onChangeStage(deal.id, e.target.value as StageKey)}
          className="w-full text-[10.5px] rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
          onClick={(e) => e.stopPropagation()}
        >
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              → chuyển sang {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Gradient tone treatment — matches Dashboard's KPI cards so the two
// presentation pages read as one design system.
const STAT_TONES: Record<string, { card: string; icon: string; value: string }> = {
  blue: {
    card: "bg-gradient-to-br from-blue-50 to-white border-blue-100",
    icon: "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-200",
    value: "text-blue-900",
  },
  violet: {
    card: "bg-gradient-to-br from-violet-50 to-white border-violet-100",
    icon: "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-200",
    value: "text-violet-900",
  },
  emerald: {
    card: "bg-gradient-to-br from-emerald-50 to-white border-emerald-100",
    icon: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-200",
    value: "text-emerald-900",
  },
};

function StatCard({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: keyof typeof STAT_TONES;
  hint?: string;
}) {
  const t = STAT_TONES[tone] ?? STAT_TONES.blue;
  return (
    <Card className={cn("border transition hover:shadow-md", t.card)}>
      <CardBody className="p-4 flex items-start gap-3">
        <div className={cn("h-11 w-11 shrink-0 rounded-xl grid place-items-center", t.icon)}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 truncate uppercase tracking-wide">
            {label}
          </div>
          <div className={cn("text-2xl font-bold tabular-nums leading-tight truncate", t.value)}>
            {value}
          </div>
          {hint && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{hint}</div>}
        </div>
      </CardBody>
    </Card>
  );
}
