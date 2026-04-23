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
 * Top bar: total pipeline value (sum of open deals), weighted forecast
 * (sum of value × probability/100 for open deals), plus vendor/owner filters.
 * "Open" = everything except closed_won / closed_lost.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Target,
  Filter,
  TrendingUp,
  ExternalLink,
  Pencil,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Deal, User } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { formatVND, formatDate, stageColor } from "@/lib/format";
import { DealDialog } from "@/modules/crm/DealDialog";

type StageKey =
  | "prospecting"
  | "qualification"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

const STAGES: Array<{ key: StageKey; label: string }> = [
  { key: "prospecting", label: "Prospecting" },
  { key: "qualification", label: "Qualification" },
  { key: "proposal", label: "Proposal" },
  { key: "negotiation", label: "Negotiation" },
  { key: "closed_won", label: "Closed — Won" },
  { key: "closed_lost", label: "Closed — Lost" },
];

const OPEN_STAGES: StageKey[] = ["prospecting", "qualification", "proposal", "negotiation"];

const VENDORS = ["HPE", "Dell", "IBM", "Palo Alto", "CrowdStrike", "Microsoft", "Other"];

export function PipelineView() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canDelete = user?.role === "admin";
  const isAdmin = user?.role === "admin";
  const [vendor, setVendor] = useState("");
  // Owner filter only appears for admins (sales already see only their own).
  // Empty string = show all. Stores userId.
  const [ownerFilter, setOwnerFilter] = useState("");
  const [editDeal, setEditDeal] = useState<Deal | null>(null);

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

  // Owner filter is applied client-side on top of the server response — the
  // server already scopes sales to their own deals, and for admin the extra
  // param round-trip isn't worth it when we already have everyone loaded.
  const filteredDeals = useMemo(() => {
    if (!ownerFilter) return deals ?? [];
    return (deals ?? []).filter((d) => d.ownerId === ownerFilter || d.owner?.id === ownerFilter);
  }, [deals, ownerFilter]);

  const grouped = useMemo(() => {
    const g: Record<StageKey, Deal[]> = {
      prospecting: [],
      qualification: [],
      proposal: [],
      negotiation: [],
      closed_won: [],
      closed_lost: [],
    };
    for (const d of filteredDeals) {
      const s = (d.stage as StageKey) in g ? (d.stage as StageKey) : "prospecting";
      g[s].push(d);
    }
    return g;
  }, [filteredDeals]);

  const stats = useMemo(() => {
    const open = filteredDeals.filter((d) => OPEN_STAGES.includes(d.stage as StageKey));
    const totalValue = open.reduce((s, d) => s + (d.value ?? 0), 0);
    const weighted = open.reduce(
      (s, d) => s + ((d.value ?? 0) * (d.probability ?? 0)) / 100,
      0,
    );
    const won = filteredDeals
      .filter((d) => d.stage === "closed_won")
      .reduce((s, d) => s + (d.value ?? 0), 0);
    return { openCount: open.length, totalValue, weighted, won };
  }, [filteredDeals]);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-brand-600" />
            Sales Pipeline
          </h1>
          <p className="text-sm text-slate-500">
            Toàn bộ deal đang theo đuổi, nhóm theo stage. Click stage trên card để đổi.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Briefcase className="h-4 w-4" />}
          label="Deal đang mở"
          value={stats.openCount.toString()}
          tone="slate"
        />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Tổng pipeline"
          value={formatVND(stats.totalValue)}
          tone="slate"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Forecast (weighted)"
          value={formatVND(stats.weighted)}
          tone="brand"
          hint="Σ (giá trị × xác suất)"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Closed — Won"
          value={formatVND(stats.won)}
          tone="emerald"
        />
      </div>

      {/* Filter bar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs text-slate-500">Lọc:</span>
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs"
          >
            <option value="">Mọi vendor</option>
            {VENDORS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
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
          {(vendor || ownerFilter) && (
            <button
              onClick={() => {
                setVendor("");
                setOwnerFilter("");
              }}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              xoá lọc
            </button>
          )}
          <div className="ml-auto text-[11px] text-slate-400">
            {isLoading
              ? "Đang tải..."
              : ownerFilter || vendor
                ? `${filteredDeals.length} / ${deals?.length ?? 0} deals`
                : `${deals?.length ?? 0} deals`}
          </div>
        </div>
      </Card>

      {/* Kanban */}
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

function KanbanColumn({
  stage,
  deals,
  showOwner,
  onChangeStage,
  onEdit,
  onDelete,
}: {
  stage: { key: StageKey; label: string };
  deals: Deal[];
  showOwner: boolean;
  onChangeStage: (id: string, newStage: StageKey) => void;
  onEdit: (d: Deal) => void;
  onDelete?: (d: Deal) => void;
}) {
  const total = deals.reduce((s, d) => s + (d.value ?? 0), 0);
  return (
    <div className="w-72 shrink-0">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Badge className={stageColor(stage.key)}>{stage.label}</Badge>
          <span className="text-xs text-slate-500">({deals.length})</span>
        </div>
        {deals.length > 0 && (
          <div className="text-[11px] text-slate-500 tabular-nums">{formatVND(total)}</div>
        )}
      </div>
      <div className="rounded-lg bg-slate-100/70 p-2 space-y-2 min-h-[220px]">
        {deals.length === 0 ? (
          <div className="text-[11px] text-slate-400 text-center py-6">— trống —</div>
        ) : (
          deals.map((d) => (
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
  return (
    <div className="group rounded-md bg-white border border-slate-200 p-2.5 shadow-sm hover:shadow transition">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-medium text-sm text-slate-800 line-clamp-2">{deal.title}</div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={onEdit}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Sửa"
          >
            <Pencil className="h-3 w-3" />
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              title="Xoá"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          {deal.account && (
            <Link
              to={`/crm/${deal.account.id}`}
              title={`Mở account ${deal.account.companyName}`}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
            >
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {deal.account && (
        <div className="text-[11px] text-slate-500 truncate mb-1">{deal.account.companyName}</div>
      )}

      {/* Owner chip — only shown for admins. For sales this is always
          themselves and would just be noise. */}
      {showOwner && deal.owner && (
        <div className="mb-2 inline-flex items-center gap-1 rounded bg-slate-50 border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
          <UserIcon className="h-2.5 w-2.5" />
          {deal.owner.name}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-sm font-semibold text-slate-900 tabular-nums">
          {formatVND(deal.value)}
        </div>
        {deal.probability != null && (
          <Badge className="bg-slate-100 text-slate-600 text-[10px]">{deal.probability}%</Badge>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <select
          value={deal.stage}
          onChange={(e) => onChangeStage(deal.id, e.target.value as StageKey)}
          className="text-[11px] rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
          onClick={(e) => e.stopPropagation()}
        >
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          {deal.vendor && <span className="truncate max-w-[70px]">{deal.vendor}</span>}
          {deal.expectedClose && <span>· {formatDate(deal.expectedClose)}</span>}
        </div>
      </div>
    </div>
  );
}

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
  tone: "slate" | "brand" | "emerald";
  hint?: string;
}) {
  const toneCls =
    tone === "brand"
      ? "border-brand-200 bg-brand-50"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50"
        : "border-slate-200 bg-white";
  const iconCls =
    tone === "brand"
      ? "text-brand-600 bg-brand-100"
      : tone === "emerald"
        ? "text-emerald-700 bg-emerald-100"
        : "text-slate-500 bg-slate-100";
  return (
    <Card className={`p-3 border ${toneCls}`}>
      <CardBody className="p-0 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-md grid place-items-center ${iconCls}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[11px] text-slate-500 truncate">{label}</div>
          <div className="text-lg font-semibold text-slate-900 tabular-nums leading-tight">
            {value}
          </div>
          {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
        </div>
      </CardBody>
    </Card>
  );
}
