import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart2,
  Filter,
  History,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import type { WinLossMetrics, WinLossReport } from "@/lib/types";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { formatDate, formatVND, relativeTime } from "@/lib/format";

interface Filters {
  from?: string;
  to?: string;
  vendor?: string;
  productLine?: string;
}

type ReportSummary = Pick<WinLossReport, "id" | "title" | "createdAt" | "filters">;

export function WinLossDashboard() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>({});
  const [viewingReport, setViewingReport] = useState<string | null>(null);

  const query = buildQuery(filters);
  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ["winloss-metrics", query],
    queryFn: () => api.get<WinLossMetrics>(`/win-loss/metrics${query}`),
    enabled: !viewingReport,
  });

  const { data: reports } = useQuery({
    queryKey: ["winloss-reports"],
    queryFn: () => api.get<ReportSummary[]>("/win-loss/reports"),
  });

  const { data: reportDetail } = useQuery({
    queryKey: ["winloss-report", viewingReport],
    queryFn: () => api.get<WinLossReport>(`/win-loss/reports/${viewingReport}`),
    enabled: !!viewingReport,
  });

  const analyze = useMutation({
    mutationFn: () =>
      api.post<WinLossReport>("/win-loss/analyze", {
        filters,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["winloss-reports"] });
      setViewingReport(r.id);
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.del<{ deleted: boolean }>(`/win-loss/reports/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["winloss-reports"] });
      if (viewingReport) setViewingReport(null);
    },
  });

  const displayMetrics: WinLossMetrics | undefined = viewingReport
    ? (reportDetail?.metrics as WinLossMetrics | undefined)
    : metrics;

  const hasData = !!displayMetrics && displayMetrics.totalClosed > 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-brand-600" />
            Win/Loss Analysis
          </h1>
          <p className="text-sm text-slate-500">
            Phân tích vì sao thắng/thua, pattern theo vendor, product line và khuyến nghị hành động.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {viewingReport && (
            <Button variant="ghost" size="sm" onClick={() => setViewingReport(null)}>
              Về dashboard
            </Button>
          )}
          {!viewingReport && (
            <Button size="sm" loading={analyze.isPending} onClick={() => analyze.mutate()}>
              <Sparkles className="h-3.5 w-3.5" />
              AI phân tích + lưu
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          {!viewingReport && (
            <Card>
              <CardBody>
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700">
                  <Filter className="h-4 w-4 text-slate-500" />
                  Bộ lọc
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <Label htmlFor="from">Từ ngày</Label>
                    <Input
                      id="from"
                      type="date"
                      value={filters.from ?? ""}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, from: e.target.value || undefined }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="to">Đến ngày</Label>
                    <Input
                      id="to"
                      type="date"
                      value={filters.to ?? ""}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, to: e.target.value || undefined }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="vendor">Vendor</Label>
                    <Input
                      id="vendor"
                      placeholder="HPE, Dell, PA..."
                      value={filters.vendor ?? ""}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, vendor: e.target.value || undefined }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="pl">Product line</Label>
                    <Input
                      id="pl"
                      placeholder="firewall, server..."
                      value={filters.productLine ?? ""}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, productLine: e.target.value || undefined }))
                      }
                    />
                  </div>
                </div>
                {Object.keys(filters).length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setFilters({})}
                      className="text-xs text-slate-500 hover:text-rose-600"
                    >
                      Xóa bộ lọc
                    </button>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {viewingReport && reportDetail && (
            <Card>
              <CardBody>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h2 className="text-base font-semibold">{reportDetail.title}</h2>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Tạo {relativeTime(reportDetail.createdAt)} ·{" "}
                      {new Date(reportDetail.createdAt).toLocaleString("vi-VN")}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Xóa report này?")) delMut.mutate(viewingReport);
                    }}
                    className="text-slate-400 hover:text-rose-600 transition"
                    title="Xóa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(reportDetail.filters ?? {}).map(([k, v]) =>
                    v ? (
                      <Badge key={k} className="bg-slate-100 text-slate-700">
                        {k}: {String(v)}
                      </Badge>
                    ) : null,
                  )}
                </div>
                <div className="prose-hsi text-slate-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportDetail.aiInsights}</ReactMarkdown>
                </div>
              </CardBody>
            </Card>
          )}

          {loadingMetrics && !viewingReport && (
            <Card>
              <CardBody className="text-sm text-slate-500">Đang tổng hợp...</CardBody>
            </Card>
          )}

          {!loadingMetrics && !hasData && (
            <Card>
              <CardBody className="py-12 text-center text-sm text-slate-500">
                Chưa có deal đã đóng (won/lost) nào trong kỳ.
              </CardBody>
            </Card>
          )}

          {hasData && displayMetrics && <MetricsView m={displayMetrics} />}

          {analyze.error && (
            <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {(analyze.error as Error).message}
            </div>
          )}
        </div>

        <aside className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1 px-1 flex items-center gap-1">
            <History className="h-3 w-3" />
            Lịch sử phân tích
          </div>
          {(reports ?? []).length === 0 && (
            <div className="text-xs text-slate-400 italic px-1">
              Chưa có report. Bấm "AI phân tích" để tạo.
            </div>
          )}
          {(reports ?? []).map((r) => (
            <button
              key={r.id}
              onClick={() => setViewingReport(r.id)}
              className={
                "w-full text-left rounded-lg border px-3 py-2 transition " +
                (viewingReport === r.id
                  ? "border-brand-300 bg-brand-50/60"
                  : "border-slate-200 bg-white hover:border-slate-300")
              }
            >
              <div className="text-sm font-medium text-slate-800 line-clamp-2">
                {r.title}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {relativeTime(r.createdAt)}
              </div>
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}

function MetricsView({ m }: { m: WinLossMetrics }) {
  const winPct = Math.round(m.winRate * 100);
  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI
              icon={<Trophy className="h-4 w-4 text-emerald-600" />}
              label="Win rate"
              value={`${winPct}%`}
              sub={`${m.won}/${m.totalClosed} deals`}
              tone="emerald"
            />
            <KPI
              icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
              label="Giá trị thắng"
              value={formatVND(m.wonValue)}
              sub={`avg ${formatVND(m.avgWonValue)}`}
              tone="emerald"
            />
            <KPI
              icon={<TrendingDown className="h-4 w-4 text-rose-600" />}
              label="Giá trị thua"
              value={formatVND(m.lostValue)}
              sub={`avg ${formatVND(m.avgLostValue)}`}
              tone="rose"
            />
            <KPI
              icon={<BarChart2 className="h-4 w-4 text-slate-600" />}
              label="Chu kỳ TB"
              value={m.avgCycleDays ? `${m.avgCycleDays}d` : "—"}
              sub={`${m.totalClosed} deals đóng`}
              tone="slate"
            />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Won {m.won}</span>
              <span>Lost {m.lost}</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="bg-emerald-500"
                style={{ width: `${winPct}%` }}
                title={`Won ${winPct}%`}
              />
              <div
                className="bg-rose-400"
                style={{ width: `${100 - winPct}%` }}
                title={`Lost ${100 - winPct}%`}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardBody>
            <div className="text-sm font-semibold mb-3">Theo Vendor</div>
            {Object.keys(m.byVendor).length === 0 ? (
              <div className="text-xs text-slate-400 italic">Không có data.</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(m.byVendor)
                  .sort((a, b) => b[1].won + b[1].lost - (a[1].won + a[1].lost))
                  .map(([v, d]) => {
                    const pct = Math.round(d.winRate * 100);
                    return (
                      <div key={v}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="font-medium text-slate-800">{v}</span>
                          <span className="text-slate-500">
                            {d.won}W / {d.lost}L · {pct}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={
                              "h-full " +
                              (pct >= 60
                                ? "bg-emerald-500"
                                : pct >= 40
                                  ? "bg-amber-500"
                                  : "bg-rose-400")
                            }
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-sm font-semibold mb-3">Theo Product Line</div>
            {Object.keys(m.byProductLine).length === 0 ? (
              <div className="text-xs text-slate-400 italic">Không có data.</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(m.byProductLine)
                  .sort((a, b) => b[1].won + b[1].lost - (a[1].won + a[1].lost))
                  .map(([pl, d]) => {
                    const pct = Math.round(d.winRate * 100);
                    return (
                      <div key={pl}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="font-medium text-slate-800">{pl}</span>
                          <span className="text-slate-500">
                            {d.won}W / {d.lost}L · {pct}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={
                              "h-full " +
                              (pct >= 60
                                ? "bg-emerald-500"
                                : pct >= 40
                                  ? "bg-amber-500"
                                  : "bg-rose-400")
                            }
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-sm font-semibold mb-2 text-emerald-800">Top lý do WIN</div>
            {m.topWinReasons.length === 0 ? (
              <div className="text-xs text-slate-400 italic">
                Chưa có lý do (cập nhật winReason khi đóng deal để AI phân tích tốt hơn).
              </div>
            ) : (
              <ul className="space-y-1">
                {m.topWinReasons.map((r) => (
                  <li key={r.reason} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 truncate mr-2">{r.reason}</span>
                    <Badge className="bg-emerald-100 text-emerald-800">{r.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-sm font-semibold mb-2 text-rose-800">Top lý do LOSS</div>
            {m.topLossReasons.length === 0 ? (
              <div className="text-xs text-slate-400 italic">
                Chưa có lý do (cập nhật lossReason khi đóng deal để AI phân tích tốt hơn).
              </div>
            ) : (
              <ul className="space-y-1">
                {m.topLossReasons.map((r) => (
                  <li key={r.reason} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 truncate mr-2">{r.reason}</span>
                    <Badge className="bg-rose-100 text-rose-800">{r.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <DealsSample title="Deals thắng gần đây" deals={m.sampleWon} tone="emerald" />
        <DealsSample title="Deals thua gần đây" deals={m.sampleLost} tone="rose" />
      </div>
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "emerald" | "rose" | "slate";
}) {
  const toneMap: Record<string, string> = {
    emerald: "text-emerald-900",
    rose: "text-rose-900",
    slate: "text-slate-900",
  };
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <div className={`text-xl font-semibold mt-1 ${toneMap[tone]}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function DealsSample({
  title,
  deals,
  tone,
}: {
  title: string;
  deals: WinLossMetrics["sampleWon"];
  tone: "emerald" | "rose";
}) {
  const color = tone === "emerald" ? "text-emerald-800" : "text-rose-800";
  return (
    <Card>
      <CardBody>
        <div className={`text-sm font-semibold mb-2 ${color}`}>{title}</div>
        {deals.length === 0 ? (
          <div className="text-xs text-slate-400 italic">Không có deal.</div>
        ) : (
          <ul className="space-y-1.5">
            {deals.map((d) => (
              <li key={d.id} className="text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-slate-800">{d.title}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {d.account}
                      {d.reason && ` · ${d.reason}`}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-700 shrink-0">
                    {formatVND(d.value)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function buildQuery(f: Filters): string {
  const parts: string[] = [];
  if (f.from) parts.push(`from=${encodeURIComponent(f.from)}`);
  if (f.to) parts.push(`to=${encodeURIComponent(f.to)}`);
  if (f.vendor) parts.push(`vendor=${encodeURIComponent(f.vendor)}`);
  if (f.productLine) parts.push(`productLine=${encodeURIComponent(f.productLine)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}
