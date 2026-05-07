/**
 * Dashboard — landing page after login.
 *
 * Same component for sales and admin: the backend already scopes /deals
 * + /accounts to the caller's role, so all the numbers automatically mean
 * "mine" for sales and "team-wide" for admin.
 *
 * Admin-only blocks (sales leaderboard + recent audit highlights) gate
 * on user.role and use admin-only endpoints — sales never hit them.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Target,
  TrendingUp,
  Users,
  Activity as ActivityIcon,
  Trophy,
  Shield,
  ArrowRight,
  CalendarClock,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Account, Activity, Deal } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import {
  formatVND,
  formatDate,
  relativeTime,
  stageColor,
  healthColor,
  healthLabel,
} from "@/lib/format";

const OPEN_STAGES = ["prospecting", "qualification", "proposal", "negotiation"];

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

  // === KPIs ===
  const kpis = useMemo(() => {
    const all = deals ?? [];
    const open = all.filter((d) => OPEN_STAGES.includes(d.stage));
    const openValue = open.reduce((s, d) => s + (d.value ?? 0), 0);
    const weighted = open.reduce(
      (s, d) => s + ((d.value ?? 0) * (d.probability ?? 0)) / 100,
      0,
    );
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const wonMTD = all
      .filter(
        (d) => d.stage === "closed_won" && new Date(d.updatedAt) >= startOfMonth,
      )
      .reduce((s, d) => s + (d.value ?? 0), 0);
    return {
      openCount: open.length,
      openValue,
      weighted,
      wonMTD,
      accountCount: accounts?.length ?? 0,
    };
  }, [deals, accounts]);

  // === Pipeline by stage ===
  const stageBreakdown = useMemo(() => {
    const stages = ["prospecting", "qualification", "proposal", "negotiation"];
    return stages.map((stage) => {
      const items = (deals ?? []).filter((d) => d.stage === stage);
      const value = items.reduce((s, d) => s + (d.value ?? 0), 0);
      return { stage, count: items.length, value };
    });
  }, [deals]);

  const stageMax = Math.max(1, ...stageBreakdown.map((s) => s.value));

  // === Account health buckets ===
  const healthBuckets = useMemo(() => {
    const all = accounts ?? [];
    const bucket = (score: number | null) => {
      if (score == null) return "unassessed";
      if (score >= 75) return "healthy";
      if (score >= 55) return "watch";
      if (score >= 35) return "at_risk";
      return "critical";
    };
    const counts = { healthy: 0, watch: 0, at_risk: 0, critical: 0, unassessed: 0 };
    for (const a of all) counts[bucket(a.healthScore) as keyof typeof counts]++;
    return counts;
  }, [accounts]);

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
  // Roll up deals by owner. Need at least one row to make sense.
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
      if (d.stage === "closed_won") cur.wonValue += d.value ?? 0;
      byOwner.set(owner.id, cur);
    }
    return Array.from(byOwner.values()).sort(
      (a, b) => b.openValue + b.wonValue - (a.openValue + a.wonValue),
    );
  }, [deals, isAdmin]);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-600" />
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isAdmin
              ? "Toàn cảnh team — pipeline, health, hoạt động và hiệu suất từng sales."
              : `Chào ${user?.name?.split(" ").slice(-1)[0] ?? ""} — pipeline, hoạt động và follow-ups của bạn.`}
          </p>
        </div>
        <div className="hidden md:flex gap-2">
          <Link
            to="/pipeline"
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-brand-700 border border-slate-200 rounded-md px-2.5 py-1.5"
          >
            Pipeline <ArrowRight className="h-3 w-3" />
          </Link>
          <Link
            to="/briefing"
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-brand-700 border border-slate-200 rounded-md px-2.5 py-1.5"
          >
            Daily Briefing <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          icon={<Briefcase className="h-4 w-4" />}
          label="Pipeline đang mở"
          value={formatVND(kpis.openValue)}
          hint={`${kpis.openCount} deals`}
          tone="slate"
        />
        <KPI
          icon={<TrendingUp className="h-4 w-4" />}
          label="Forecast (weighted)"
          value={formatVND(kpis.weighted)}
          hint="Σ giá trị × xác suất"
          tone="brand"
        />
        <KPI
          icon={<Trophy className="h-4 w-4" />}
          label="Closed-won (tháng này)"
          value={formatVND(kpis.wonMTD)}
          tone="emerald"
        />
        <KPI
          icon={<Users className="h-4 w-4" />}
          label={isAdmin ? "Team accounts" : "Accounts của bạn"}
          value={kpis.accountCount.toString()}
          tone="slate"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline by stage */}
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-slate-500" />
                <div className="text-sm font-semibold">Pipeline theo stage</div>
              </div>
              <Link
                to="/pipeline"
                className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-0.5"
              >
                Mở pipeline <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {stageBreakdown.map((s) => (
                <div key={s.stage}>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <Badge className={stageColor(s.stage)}>{s.stage}</Badge>
                    <div className="text-slate-500 tabular-nums">
                      {s.count} · {formatVND(s.value)}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${(s.value / stageMax) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {stageBreakdown.every((s) => s.count === 0) && (
                <div className="py-6 text-center text-xs text-slate-400">
                  Chưa có deal đang mở.
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Account health */}
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ActivityIcon className="h-4 w-4 text-slate-500" />
                <div className="text-sm font-semibold">Account health</div>
              </div>
              <Link
                to="/health-dashboard"
                className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-0.5"
              >
                Mở health <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <HealthBucket label="Healthy" count={healthBuckets.healthy} colorScore={80} />
              <HealthBucket label="Watch" count={healthBuckets.watch} colorScore={60} />
              <HealthBucket label="At risk" count={healthBuckets.at_risk} colorScore={40} />
              <HealthBucket label="Critical" count={healthBuckets.critical} colorScore={20} />
              <HealthBucket label="Chưa đánh giá" count={healthBuckets.unassessed} colorScore={null} />
            </div>
            {(accounts?.length ?? 0) === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">Chưa có account.</div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Lists row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent deals */}
        <Card>
          <CardBody className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-slate-500" />
                Deal mới cập nhật
              </div>
              <Link
                to="/pipeline"
                className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-0.5"
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
                  className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50 rounded px-1 -mx-1"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{d.title}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <Badge className={stageColor(d.stage)}>{d.stage}</Badge>
                      {d.account && <span className="truncate">· {d.account.companyName}</span>}
                      {isAdmin && d.owner && (
                        <span className="text-slate-400">· {d.owner.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums whitespace-nowrap">
                    {formatVND(d.value)}
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
                <CalendarClock className="h-4 w-4 text-slate-500" />
                Sắp đến hạn (7 ngày)
              </div>
              <Link
                to="/meetings/actions"
                className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-0.5"
              >
                Action board <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {upcoming.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">
                Không có việc nào trong 7 ngày tới.
              </div>
            )}
            <div className="divide-y divide-slate-100">
              {upcoming.map((a) => (
                <Link
                  key={a.id}
                  to={a.accountId ? `/crm/${a.accountId}` : "/meetings/actions"}
                  className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50 rounded px-1 -mx-1"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-800 truncate">{a.subject}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <Badge className="bg-slate-100 text-slate-700 capitalize">{a.type}</Badge>
                      {a.dueDate && <span>· {formatDate(a.dueDate)}</span>}
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

      {/* Admin-only: leaderboard + recent audit */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sales leaderboard */}
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
                      <tr key={row.email}>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
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
                          {formatVND(row.openValue)}
                        </td>
                        <td className="py-2 text-right text-emerald-700 tabular-nums whitespace-nowrap">
                          {formatVND(row.wonValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>

          {/* Recent audit highlights */}
          <Card>
            <CardBody className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-slate-500" />
                  Hoạt động gần đây
                </div>
                <Link
                  to="/admin/audit"
                  className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-0.5"
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
  tone: "slate" | "brand" | "emerald";
}) {
  const cardCls =
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
    <Card className={`p-3 border ${cardCls}`}>
      <CardBody className="p-0 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-md grid place-items-center ${iconCls}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[11px] text-slate-500 truncate">{label}</div>
          <div className="text-lg font-semibold text-slate-900 tabular-nums leading-tight truncate">
            {value}
          </div>
          {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
        </div>
      </CardBody>
    </Card>
  );
}

function HealthBucket({
  label,
  count,
  colorScore,
}: {
  label: string;
  count: number;
  colorScore: number | null;
}) {
  return (
    <div className="text-center">
      <div
        className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold border ${healthColor(colorScore)}`}
      >
        {count}
      </div>
      <div className="mt-1.5 text-[10px] text-slate-600">
        {label}
        {colorScore != null && (
          <div className="text-[9px] text-slate-400">{healthLabel(colorScore)}</div>
        )}
      </div>
    </div>
  );
}
