/**
 * Dashboard — landing page after login.
 *
 * Presentation-grade layout: gradient hero banner, KPI cards with tone
 * gradients, OPP-color pipeline breakdown (Đỏ/Vàng/Xanh/Hồng/Xám) with a
 * stacked distribution bar, account-health rings, and activity lists.
 *
 * Same component for sales and admin: the backend already scopes /deals
 * + /accounts to the caller's role, so all the numbers automatically mean
 * "mine" for sales and "team-wide" for admin. Admin-only blocks (sales
 * leaderboard + audit trail) gate on user.role.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Target,
  TrendingUp,
  Users,
  Trophy,
  Shield,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Sparkles,
  Flag,
  Coins,
  UserPlus,
  CheckCircle2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Account, Activity, Deal, KpiProgress } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import {
  formatVND,
  formatVNDShort,
  formatDate,
  relativeTime,
  stageColor,
  stageLabel,
} from "@/lib/format";

// Open = still in play (not pink/gray). Includes legacy names for old deals.
const OPEN_STAGES = [
  "red", "yellow", "green",
  "prospecting", "qualification", "proposal", "negotiation",
];

// Solid fill colors for the OPP distribution bar + per-stage bars.
const STAGE_FILL: Record<string, string> = {
  red: "bg-rose-500",
  yellow: "bg-amber-400",
  green: "bg-emerald-500",
  pink: "bg-pink-400",
  gray: "bg-slate-300",
};

const LEGACY: Record<string, string> = {
  prospecting: "red",
  qualification: "yellow",
  proposal: "green",
  negotiation: "green",
  closed_won: "pink",
  closed_lost: "gray",
};
const colorOf = (stage: string) =>
  STAGE_FILL[stage] ? stage : (LEGACY[stage] ?? "red");

interface AuditEntry {
  id: string;
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
}

const ACTION_COLOR: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700 border-emerald-200",
  update: "bg-sky-50 text-sky-700 border-sky-200",
  status_change: "bg-indigo-50 text-indigo-700 border-indigo-200",
  reassign: "bg-amber-50 text-amber-700 border-amber-200",
  delete: "bg-rose-50 text-rose-700 border-rose-200",
  send: "bg-amber-50 text-amber-700 border-amber-200",
  export: "bg-slate-100 text-slate-700 border-slate-200",
};

export function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: deals } = useQuery({
    queryKey: ["deals", { vendor: "" }], // share cache key with PipelineView
    queryFn: () => api.get<Deal[]>("/deals"),
  });
  const { data: accounts } = useQuery({
    queryKey: ["accounts", { q: "", industry: "", minHealth: "" }],
    queryFn: () => api.get<Account[]>("/accounts"),
  });
  const { data: activities } = useQuery({
    queryKey: ["activities", "all"],
    queryFn: () => api.get<Activity[]>("/activities"),
  });
  const { data: audit } = useQuery({
    queryKey: ["audit", { take: 10 }],
    queryFn: () => api.get<AuditEntry[]>("/audit?take=10"),
    enabled: isAdmin,
  });
  const FY = new Date().getFullYear();
  const { data: kpi } = useQuery({
    queryKey: ["kpi-progress", FY],
    queryFn: () => api.get<KpiProgress>(`/kpi/progress?fiscalYear=${FY}`),
  });

  // === KPIs ===
  const kpis = useMemo(() => {
    const all = deals ?? [];
    const open = all.filter((d) => OPEN_STAGES.includes(d.stage));
    const openValue = open.reduce((s, d) => s + (d.value ?? 0), 0);
    const weighted = open.reduce(
      (s, d) => s + ((d.value ?? 0) * (d.probability ?? 0)) / 100,
      0,
    );
    const won = all.filter((d) => colorOf(d.stage) === "pink");
    const wonValue = won.reduce((s, d) => s + (d.value ?? 0), 0);
    return {
      openCount: open.length,
      openValue,
      weighted,
      wonCount: won.length,
      wonValue,
      accountCount: accounts?.length ?? 0,
    };
  }, [deals, accounts]);

  // === Full 5-color breakdown for the distribution bar ===
  const fullBreakdown = useMemo(() => {
    const order = ["red", "yellow", "green", "pink", "gray"];
    const agg: Record<string, { count: number; value: number }> = {};
    for (const key of order) agg[key] = { count: 0, value: 0 };
    for (const d of deals ?? []) {
      const c = colorOf(d.stage);
      agg[c].count++;
      agg[c].value += d.value ?? 0;
    }
    const total = Object.values(agg).reduce((s, x) => s + x.value, 0);
    return { order, agg, total };
  }, [deals]);

  // === Recent deals (last 5 by updatedAt) ===
  const recentDeals = useMemo(
    () =>
      [...(deals ?? [])]
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
        .slice(0, 5),
    [deals],
  );

  // === Upcoming activities (next 7 days, not completed) ===
  const upcoming = useMemo(() => {
    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return (activities ?? [])
      .filter((a) => {
        if (a.completed) return false;
        if (!a.dueDate) return false;
        const d = new Date(a.dueDate);
        return d >= now && d <= horizon;
      })
      .sort((a, b) => +new Date(a.dueDate!) - +new Date(b.dueDate!))
      .slice(0, 6);
  }, [activities]);

  // === Sales leaderboard (admin only) ===
  const leaderboard = useMemo(() => {
    if (!isAdmin) return [];
    const byOwner = new Map<
      string,
      { name: string; email: string; openValue: number; wonValue: number; deals: number }
    >();
    for (const d of deals ?? []) {
      const owner = d.owner;
      if (!owner) continue;
      const cur = byOwner.get(owner.id) ?? {
        name: owner.name,
        email: owner.email,
        openValue: 0,
        wonValue: 0,
        deals: 0,
      };
      cur.deals++;
      if (OPEN_STAGES.includes(d.stage)) cur.openValue += d.value ?? 0;
      if (colorOf(d.stage) === "pink") cur.wonValue += d.value ?? 0;
      byOwner.set(owner.id, cur);
    }
    return Array.from(byOwner.values()).sort(
      (a, b) => b.openValue + b.wonValue - (a.openValue + a.wonValue),
    );
  }, [deals, isAdmin]);

  const todayLabel = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const firstName = user?.name?.split(" ").slice(-1)[0] ?? "";

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* ===== Hero banner — one compact line: greeting + date + CTAs ===== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-800 px-6 py-4 text-white shadow-md">
        <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-300" />
              {isAdmin ? "Toàn cảnh kinh doanh HSI" : `Chào ${firstName}!`}
            </h1>
            <div className="mt-0.5 text-xs text-blue-200 capitalize">{todayLabel}</div>
          </div>
          <div className="flex gap-2">
            <Link
              to="/pipeline"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 backdrop-blur px-3.5 py-2 text-sm font-medium text-white hover:bg-white/25 transition"
            >
              Sales Pipeline <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              to="/briefing"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white text-brand-700 px-3.5 py-2 text-sm font-semibold hover:bg-blue-50 transition"
            >
              Daily Briefing <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* ===== KPI progress vs targets ===== */}
      {kpi && <KpiProgressSection kpi={kpi} />}

      {/* ===== KPI strip ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI
          icon={<Briefcase className="h-5 w-5" />}
          label="Pipeline đang mở"
          value={formatVNDShort(kpis.openValue)}
          hint={`${kpis.openCount} cơ hội đang theo đuổi`}
          tone="blue"
        />
        <KPI
          icon={<TrendingUp className="h-5 w-5" />}
          label="Forecast (weighted)"
          value={formatVNDShort(kpis.weighted)}
          hint="Σ giá trị × xác suất thành công"
          tone="violet"
        />
        <KPI
          icon={<Trophy className="h-5 w-5" />}
          label="Đã ký hợp đồng"
          value={formatVNDShort(kpis.wonValue)}
          hint={`${kpis.wonCount} hợp đồng FY2026`}
          tone="emerald"
        />
        <KPI
          icon={<Users className="h-5 w-5" />}
          label={isAdmin ? "Team accounts" : "Khách hàng của bạn"}
          value={kpis.accountCount.toString()}
          hint="accounts đang quản lý"
          tone="amber"
        />
      </div>

      {/* ===== OPP distribution bar ===== */}
      <Card className="overflow-hidden">
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-brand-600" />
              <div className="text-sm font-semibold">Phân bố OPP theo màu</div>
            </div>
            <div className="text-xs text-slate-500 tabular-nums">
              Tổng: <span className="font-semibold text-slate-800">{formatVND(fullBreakdown.total)}</span>
            </div>
          </div>
          {/* stacked bar */}
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
            {fullBreakdown.order.map((key) => {
              const seg = fullBreakdown.agg[key];
              if (!seg.value) return null;
              const pct = (seg.value / Math.max(1, fullBreakdown.total)) * 100;
              return (
                <div
                  key={key}
                  className={cn(STAGE_FILL[key], "h-full transition-all")}
                  style={{ width: `${pct}%` }}
                  title={`${stageLabel(key)}: ${seg.count} deals · ${formatVND(seg.value)}`}
                />
              );
            })}
          </div>
          {/* legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {fullBreakdown.order.map((key) => {
              const seg = fullBreakdown.agg[key];
              return (
                <div key={key} className="flex items-center gap-1.5 text-xs">
                  <span className={cn("h-2.5 w-2.5 rounded-full", STAGE_FILL[key])} />
                  <span className="text-slate-700 font-medium">{stageLabel(key)}</span>
                  <span className="text-slate-400 tabular-nums">
                    {seg.count} · {formatVNDShort(seg.value)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* ===== Lists row ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent deals */}
        <Card>
          <CardBody className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-brand-600" />
                Deal mới cập nhật
              </div>
              <Link
                to="/pipeline"
                className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-0.5 font-medium"
              >
                Tất cả <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {recentDeals.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">Chưa có deal.</div>
            )}
            <div className="divide-y divide-slate-100">
              {recentDeals.map((d) => (
                <Link
                  key={d.id}
                  to={d.account ? `/crm/${d.account.id}` : "/pipeline"}
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50 rounded-lg px-2 -mx-2 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{d.title}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <Badge className={stageColor(d.stage)}>{stageLabel(d.stage)}</Badge>
                      {d.account && <span className="truncate">{d.account.companyName}</span>}
                      {isAdmin && d.owner && (
                        <span className="text-slate-400">· {d.owner.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums whitespace-nowrap text-slate-900">
                    {formatVNDShort(d.value)}
                  </div>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Upcoming activities */}
        <Card>
          <CardBody className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-brand-600" />
                Sắp đến hạn (7 ngày)
              </div>
              <Link
                to="/meetings/actions"
                className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-0.5 font-medium"
              >
                Action board <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {upcoming.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400">
                🎉 Không có việc nào đến hạn trong 7 ngày tới.
              </div>
            )}
            <div className="divide-y divide-slate-100">
              {upcoming.map((a) => (
                <Link
                  key={a.id}
                  to={a.accountId ? `/crm/${a.accountId}` : "/meetings/actions"}
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50 rounded-lg px-2 -mx-2 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-800 truncate">{a.subject}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <Badge className="bg-slate-100 text-slate-700 capitalize">{a.type}</Badge>
                      {a.dueDate && <span>{formatDate(a.dueDate)}</span>}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 whitespace-nowrap">
                    {a.dueDate && relativeTime(a.dueDate)}
                  </div>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ===== Admin-only: leaderboard + recent audit ===== */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardBody className="space-y-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Sales leaderboard
                <Badge className="bg-rose-50 text-rose-700 border border-rose-200">
                  <Shield className="h-2.5 w-2.5 mr-0.5" /> admin
                </Badge>
              </div>
              {leaderboard.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Chưa có deal nào để xếp hạng.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-1.5 font-medium">Sales</th>
                      <th className="text-right py-1.5 font-medium">Deals</th>
                      <th className="text-right py-1.5 font-medium">Pipeline</th>
                      <th className="text-right py-1.5 font-medium">Won</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaderboard.map((row, i) => (
                      <tr key={row.email} className="hover:bg-slate-50">
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                                i === 0
                                  ? "bg-amber-100 text-amber-700"
                                  : i === 1
                                    ? "bg-slate-200 text-slate-600"
                                    : "bg-slate-100 text-slate-500",
                              )}
                            >
                              {i + 1}
                            </span>
                            <div>
                              <div className="text-sm font-medium">{row.name}</div>
                              <div className="text-[10px] text-slate-500">{row.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 text-right text-slate-600 tabular-nums">
                          {row.deals}
                        </td>
                        <td className="py-2 text-right tabular-nums whitespace-nowrap">
                          {formatVNDShort(row.openValue)}
                        </td>
                        <td className="py-2 text-right text-emerald-700 font-semibold tabular-nums whitespace-nowrap">
                          {formatVNDShort(row.wonValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-brand-600" />
                  Hoạt động gần đây
                </div>
                <Link
                  to="/admin/audit"
                  className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-0.5 font-medium"
                >
                  Audit log <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {(audit?.length ?? 0) === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Chưa có hoạt động.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {(audit ?? []).map((e) => (
                    <div key={e.id} className="py-2">
                      <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                        <span
                          className={`inline-flex items-center font-medium px-1.5 py-0.5 rounded border ${
                            ACTION_COLOR[e.action] ?? "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {e.action}
                        </span>
                        <span className="text-slate-500">{e.entity}</span>
                        <span className="ml-auto text-slate-400">{relativeTime(e.createdAt)}</span>
                      </div>
                      <div className="text-sm text-slate-700 mt-0.5 line-clamp-2">{e.summary}</div>
                      <div className="text-[10px] text-slate-400">{e.userEmail}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

const KPI_TONES: Record<
  string,
  { card: string; icon: string; value: string }
> = {
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
  amber: {
    card: "bg-gradient-to-br from-amber-50 to-white border-amber-100",
    icon: "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-200",
    value: "text-amber-900",
  },
};

function KPI({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: keyof typeof KPI_TONES;
}) {
  const t = KPI_TONES[tone];
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

// ===========================================================================
// KPI progress vs fiscal-year targets.
// ===========================================================================
function KpiProgressSection({ kpi }: { kpi: KpiProgress }) {
  const hasAnyTarget =
    kpi.target.revenue != null ||
    kpi.target.grossProfit != null ||
    kpi.target.newAccounts != null;

  // Empty state — prompt the rep to set their KPI.
  if (!hasAnyTarget) {
    return (
      <Card className="border-dashed">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white grid place-items-center shadow-md shadow-amber-200">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800">
                Chưa đặt mục tiêu KPI năm {kpi.fiscalYear}
              </div>
              <div className="text-xs text-slate-500">
                Đặt mục tiêu để dashboard tự so sánh tiến độ đã đạt.
              </div>
            </div>
          </div>
          <Link
            to="/kpi"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 text-white px-3.5 py-2 text-sm font-medium hover:bg-brand-700 transition shadow-sm"
          >
            <Target className="h-4 w-4" />
            Cài đặt KPI
          </Link>
        </CardBody>
      </Card>
    );
  }

  const elapsedPct = Math.round(kpi.yearElapsed * 100);

  return (
    <Card className="overflow-hidden">
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white grid place-items-center shadow-md shadow-amber-200">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Tiến độ KPI FY{kpi.fiscalYear}
              </div>
              <div className="text-[11px] text-slate-400">
                {formatDate(kpi.fyStart)} – {formatDate(kpi.fyEnd)} · đã qua {elapsedPct}% kỳ
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              <CalendarClock className="h-3 w-3" />
              Còn {kpi.daysLeft} ngày
            </span>
            <Link
              to="/kpi"
              className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100 transition"
            >
              Sửa mục tiêu <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {kpi.target.revenue != null && (
            <KpiProgressCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Doanh số ký HĐ"
              achieved={kpi.achieved.revenue}
              target={kpi.target.revenue}
              yearElapsed={kpi.yearElapsed}
              tone="blue"
              money
            />
          )}
          {kpi.target.grossProfit != null && (
            <KpiProgressCard
              icon={<Coins className="h-4 w-4" />}
              label="Lãi gộp (LG)"
              achieved={kpi.achieved.grossProfit}
              target={kpi.target.grossProfit}
              yearElapsed={kpi.yearElapsed}
              tone="emerald"
              money
            />
          )}
          {kpi.target.newAccounts != null && (
            <KpiProgressCard
              icon={<UserPlus className="h-4 w-4" />}
              label="Khách hàng mới"
              achieved={kpi.achieved.newAccounts}
              target={kpi.target.newAccounts}
              yearElapsed={kpi.yearElapsed}
              tone="violet"
            />
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// Tone treatments match the Dashboard KPI cards so the whole page reads as
// one design system: tinted gradient card + gradient icon chip + solid bar.
const KPI_PROGRESS_TONES: Record<
  string,
  { card: string; chip: string; bar: string; text: string }
> = {
  blue: {
    card: "bg-gradient-to-br from-blue-50/70 to-white border-blue-100",
    chip: "from-blue-500 to-blue-600 shadow-blue-200",
    bar: "bg-blue-500",
    text: "text-blue-700",
  },
  emerald: {
    card: "bg-gradient-to-br from-emerald-50/70 to-white border-emerald-100",
    chip: "from-emerald-500 to-teal-600 shadow-emerald-200",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
  },
  violet: {
    card: "bg-gradient-to-br from-violet-50/70 to-white border-violet-100",
    chip: "from-violet-500 to-purple-600 shadow-violet-200",
    bar: "bg-violet-500",
    text: "text-violet-700",
  },
};

function PacingBadge({ done, onTrack }: { done: boolean; onTrack: boolean }) {
  if (done) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white shrink-0">
        <CheckCircle2 className="h-3 w-3" />
        Đạt mục tiêu
      </span>
    );
  }
  if (onTrack) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 shrink-0">
        Đúng tiến độ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-700 shrink-0">
      Chậm tiến độ
    </span>
  );
}

function KpiProgressCard({
  icon,
  label,
  achieved,
  target,
  yearElapsed,
  tone,
  money,
}: {
  icon: React.ReactNode;
  label: string;
  achieved: number;
  target: number;
  yearElapsed: number;
  tone: keyof typeof KPI_PROGRESS_TONES;
  money?: boolean;
}) {
  const t = KPI_PROGRESS_TONES[tone];
  const pct = target > 0 ? (achieved / target) * 100 : 0;
  const pctRounded = Math.round(pct);
  const gap = Math.max(0, target - achieved);
  const fmt = (n: number) => (money ? formatVND(n) : n.toLocaleString("vi-VN"));
  const fmtShort = (n: number) => (money ? formatVNDShort(n) : n.toLocaleString("vi-VN"));

  // Pacing feeds the badge only: on track when achieved% keeps up with the
  // share of the fiscal year already elapsed (5% grace margin).
  const onTrack = pct >= yearElapsed * 100 - 5;
  const done = pct >= 100;

  return (
    <div className={cn("rounded-xl border p-4", t.card)}>
      {/* Header: icon chip + label + pacing badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "h-8 w-8 shrink-0 rounded-lg grid place-items-center bg-gradient-to-br text-white shadow-md",
              t.chip,
            )}
          >
            {icon}
          </div>
          <span className="text-[13px] font-medium text-slate-700 truncate">{label}</span>
        </div>
        <PacingBadge done={done} onTrack={onTrack} />
      </div>

      {/* Achieved vs target + big percentage */}
      <div className="flex items-end justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <div className="text-[22px] leading-7 font-bold text-slate-900 tabular-nums truncate">
            {fmtShort(achieved)}
          </div>
          <div className="text-[11px] text-slate-500">mục tiêu {fmtShort(target)}</div>
        </div>
        <div
          className={cn(
            "text-[26px] leading-8 font-bold tabular-nums shrink-0",
            done ? "text-emerald-600" : t.text,
          )}
        >
          {pctRounded}
          <span className="text-sm font-semibold">%</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-2.5 rounded-full bg-white ring-1 ring-inset ring-slate-200/80 overflow-hidden">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all",
            done ? "bg-emerald-500" : t.bar,
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      {/* Gap message */}
      {done ? (
        <div className="mt-2 flex items-center gap-1.5 text-[13px] text-emerald-600 font-medium">
          <Flag className="h-3.5 w-3.5 shrink-0" />
          {achieved > target ? (
            <>Vượt mục tiêu +{fmtShort(achieved - target)}</>
          ) : (
            <>Đã đạt mục tiêu</>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "mt-2 flex items-center gap-1.5 text-[13px]",
            onTrack ? "text-slate-600" : "text-rose-600",
          )}
        >
          <Flag className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            Còn thiếu <b className="font-semibold">{fmt(gap)}</b>
          </span>
        </div>
      )}
    </div>
  );
}
