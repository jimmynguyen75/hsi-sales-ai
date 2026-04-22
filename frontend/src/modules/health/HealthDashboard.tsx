import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity as ActivityIcon,
  HeartPulse,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import type { HealthDashboard as DashData, HealthDashboardRow, HealthSnapshot } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { healthColor, healthLabel, relativeTime } from "@/lib/format";

const RISK_LABEL: Record<string, { label: string; color: string }> = {
  healthy: { label: "Healthy", color: "bg-emerald-100 text-emerald-800" },
  watch: { label: "Watch", color: "bg-amber-100 text-amber-800" },
  at_risk: { label: "At risk", color: "bg-orange-100 text-orange-800" },
  critical: { label: "Critical", color: "bg-rose-100 text-rose-800" },
  unassessed: { label: "Unassessed", color: "bg-slate-100 text-slate-600" },
};

export function HealthDashboard() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["health-dashboard"],
    queryFn: () => api.get<DashData>("/health-dashboard/dashboard"),
  });

  const bulkMut = useMutation({
    mutationFn: () => api.post<{ processed: number }>(`/health-dashboard/bulk-refresh?limit=8`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["health-dashboard"] }),
  });

  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows
      .filter((r) => {
        if (filter === "all") return true;
        if (filter === "unassessed") return !r.riskLevel;
        return r.riskLevel === filter;
      })
      .filter((r) => !q || r.companyName.toLowerCase().includes(q.toLowerCase()));
  }, [data, filter, q]);

  const selectedRow = filtered.find((r) => r.id === selected) ?? null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-rose-500" />
            Account Health Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Tổng quan sức khỏe portfolio — AI chấm điểm 0-100 dựa trên engagement, deal velocity,
            response rate.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          loading={bulkMut.isPending}
          onClick={() => bulkMut.mutate()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh top 8
        </Button>
      </div>

      {bulkMut.error && (
        <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {(bulkMut.error as Error).message}
        </div>
      )}

      {/* Buckets */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {(["healthy", "watch", "at_risk", "critical", "unassessed"] as const).map((k) => {
          const count = data?.buckets[k] ?? 0;
          const info = RISK_LABEL[k];
          const active = filter === k;
          return (
            <button
              key={k}
              onClick={() => setFilter(active ? "all" : k)}
              className={
                "rounded-lg border p-3 text-left transition " +
                (active
                  ? "border-brand-400 ring-1 ring-brand-300"
                  : "border-slate-200 bg-white hover:border-slate-300")
              }
            >
              <Badge className={info.color}>{info.label}</Badge>
              <div className="mt-1 text-2xl font-semibold">{count}</div>
              <div className="text-[11px] text-slate-500">accounts</div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardBody className="p-0">
            <div className="p-3 border-b border-slate-200 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Tìm tên account..."
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="all">Tất cả</option>
                <option value="healthy">Healthy</option>
                <option value="watch">Watch</option>
                <option value="at_risk">At risk</option>
                <option value="critical">Critical</option>
                <option value="unassessed">Unassessed</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Account</th>
                    <th className="text-left px-3 py-2 font-medium">Industry</th>
                    <th className="text-right px-3 py-2 font-medium">Score</th>
                    <th className="text-left px-3 py-2 font-medium">Risk</th>
                    <th className="text-right px-3 py-2 font-medium">Deals</th>
                    <th className="text-right px-3 py-2 font-medium">Last</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        Đang tải...
                      </td>
                    </tr>
                  )}
                  {!isLoading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
                        Không có account khớp bộ lọc.
                      </td>
                    </tr>
                  )}
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r.id)}
                      className={
                        "cursor-pointer " +
                        (selected === r.id ? "bg-brand-50/60" : "hover:bg-slate-50")
                      }
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{r.companyName}</div>
                        <div className="text-xs text-slate-500">{r.size ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{r.industry ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {r.healthScore != null ? (
                          <span
                            className={"inline-block rounded px-2 py-0.5 text-xs font-medium " + healthColor(r.healthScore)}
                          >
                            {r.healthScore}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.riskLevel ? (
                          <Badge className={RISK_LABEL[r.riskLevel]?.color ?? "bg-slate-100 text-slate-600"}>
                            {RISK_LABEL[r.riskLevel]?.label ?? r.riskLevel}
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-500">—</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-slate-600">{r.dealsCount}</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-500">
                        {r.lastAssessedAt ? relativeTime(r.lastAssessedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <aside>
          {selectedRow ? (
            <HealthDetail row={selectedRow} />
          ) : (
            <Card>
              <CardBody className="py-12 text-center text-sm text-slate-400">
                Chọn account để xem chi tiết health.
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function HealthDetail({ row }: { row: HealthDashboardRow }) {
  const { data: history } = useQuery({
    queryKey: ["health-history", row.id],
    queryFn: () => api.get<HealthSnapshot[]>(`/health-dashboard/${row.id}/history`),
    enabled: !!row.id,
  });

  const factors = row.factors;
  const snaps = history ?? [];
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const trend = first && last ? last.score - first.score : 0;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-base font-semibold">{row.companyName}</div>
              <div className="text-xs text-slate-500">
                {row.industry ?? "—"} · {row.size ?? "—"}
              </div>
            </div>
            <Link to={`/crm/${row.id}`} className="text-xs text-brand-600 hover:underline">
              Mở account →
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={
              "flex items-center justify-center rounded-full h-16 w-16 text-xl font-bold " +
              healthColor(row.healthScore)
            }
          >
            {row.healthScore ?? "—"}
          </div>
          <div className="flex-1">
            <div className="text-xs text-slate-500">Risk level</div>
            <div className="text-sm font-medium">
              {row.riskLevel
                ? RISK_LABEL[row.riskLevel]?.label ?? row.riskLevel
                : "Chưa đánh giá"}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {healthLabel(row.healthScore)}
            </div>
          </div>
          {snaps.length >= 2 && (
            <div className="text-right">
              <div className="text-xs text-slate-500">Δ từ đầu kỳ</div>
              <div
                className={
                  "text-sm font-medium flex items-center gap-1 justify-end " +
                  (trend >= 0 ? "text-emerald-700" : "text-rose-700")
                }
              >
                {trend >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {trend >= 0 ? "+" : ""}
                {trend}
              </div>
            </div>
          )}
        </div>

        {row.explanation && (
          <div className="rounded bg-slate-50 p-3 text-xs text-slate-700 italic">
            {row.explanation}
          </div>
        )}

        {factors && (
          <div>
            <div className="text-xs uppercase text-slate-500 mb-1">Factor breakdown</div>
            <div className="space-y-1.5">
              {Object.entries(factors).map(([key, val]) => (
                <FactorBar key={key} label={key.replace(/_/g, " ")} value={val as number} />
              ))}
            </div>
          </div>
        )}

        {snaps.length >= 2 && (
          <div>
            <div className="text-xs uppercase text-slate-500 mb-1">Lịch sử điểm</div>
            <Sparkline values={snaps.map((s) => s.score)} />
            <div className="text-[11px] text-slate-400 mt-1">
              {snaps.length} snapshot · {relativeTime(snaps[0].createdAt)} → {relativeTime(last.createdAt)}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ActivityIcon className="h-3.5 w-3.5" />
          {row.dealsCount} deals · {row.activitiesCount} activities
        </div>
      </CardBody>
    </Card>
  );
}

function FactorBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-600 capitalize">
        <span>{label}</span>
        <span className="font-medium">{pct}</span>
      </div>
      <div className="h-1.5 rounded bg-slate-100 overflow-hidden">
        <div className={"h-full " + color} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = 100;
  const min = 0;
  const width = 240;
  const height = 40;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const y = height - ((v - min) / (max - min)) * height;
    return `${i * step},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className="text-brand-500">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={points.join(" ")}
      />
      {values.map((v, i) => {
        const y = height - ((v - min) / (max - min)) * height;
        return <circle key={i} cx={i * step} cy={y} r={2.5} fill="currentColor" />;
      })}
    </svg>
  );
}
