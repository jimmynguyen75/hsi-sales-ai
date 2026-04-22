import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Briefcase,
  Calendar,
  Printer,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import type { SalesReport } from "@/lib/types";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDate, formatVND } from "@/lib/format";

export function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: report, isLoading } = useQuery({
    queryKey: ["report", id],
    queryFn: () => api.get<SalesReport>(`/reports/${id}`),
    enabled: !!id,
  });

  if (isLoading)
    return <div className="p-6 text-sm text-slate-500">Đang tải report...</div>;
  if (!report) return <div className="p-6 text-sm text-slate-500">Không tìm thấy report.</div>;

  const s = report.sections;

  return (
    <div className="p-6 space-y-4 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between print:hidden">
        <Link
          to="/reports"
          className="text-sm text-slate-600 hover:text-brand-700 flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Về danh sách
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" />
          In / PDF
        </Button>
      </div>

      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-brand-600" />
                {report.title}
              </h1>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {formatDate(report.startDate)} → {formatDate(report.endDate)}
                </span>
                <span>·</span>
                <Badge className="bg-brand-50 text-brand-700">{s.period.label}</Badge>
              </div>
            </div>
          </div>
          <div className="prose-hsi text-slate-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.content}</ReactMarkdown>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <SectionCard icon={<Briefcase className="h-4 w-4 text-indigo-600" />} title="Pipeline đang mở">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-2xl font-semibold text-slate-900">
              {formatVND(s.pipeline.openValue)}
            </div>
            <div className="text-xs text-slate-500">{s.pipeline.openCount} deals</div>
          </div>
          <div className="space-y-1">
            {Object.entries(s.pipeline.byStage).map(([stage, v]) => (
              <RowKV key={stage} k={stage} v={`${v.count} · ${formatVND(v.value)}`} />
            ))}
          </div>
          {Object.keys(s.pipeline.byVendor).length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                Theo vendor
              </div>
              <div className="space-y-1">
                {Object.entries(s.pipeline.byVendor)
                  .sort((a, b) => b[1].value - a[1].value)
                  .slice(0, 6)
                  .map(([v, d]) => (
                    <RowKV key={v} k={v} v={`${d.count} · ${formatVND(d.value)}`} />
                  ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} title="Kết quả kỳ">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatBox label="Won" value={s.closed.won.count} sub={formatVND(s.closed.won.value)} tone="emerald" />
            <StatBox label="Lost" value={s.closed.lost.count} sub={formatVND(s.closed.lost.value)} tone="rose" />
            <StatBox
              label="Win rate"
              value={`${Math.round(s.closed.winRate * 100)}%`}
              tone="brand"
            />
          </div>
          {s.meetings > 0 && (
            <div className="text-xs text-slate-600">
              Meetings trong kỳ: <span className="font-medium text-slate-900">{s.meetings}</span>
            </div>
          )}
        </SectionCard>

        <SectionCard icon={<Target className="h-4 w-4 text-amber-600" />} title={`Top deals (${s.topDeals.length})`}>
          {s.topDeals.length === 0 ? (
            <Empty>Chưa có deal nổi bật.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {s.topDeals.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate text-slate-800">{d.title}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {d.account} · {d.stage}
                    </div>
                  </div>
                  <span className="text-xs text-slate-700 font-medium shrink-0">
                    {formatVND(d.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard icon={<Users className="h-4 w-4 text-blue-600" />} title={`Top accounts (${s.topAccounts.length})`}>
          {s.topAccounts.length === 0 ? (
            <Empty>Chưa có account nổi bật.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {s.topAccounts.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2 text-sm">
                  <Link to={`/crm/${a.id}`} className="text-slate-800 hover:text-brand-700 truncate">
                    {a.name}
                  </Link>
                  <span className="text-xs text-slate-500 shrink-0">
                    {a.dealCount} deals · {formatVND(a.totalValue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {Object.keys(s.activity.byType).length > 0 && (
        <Card>
          <CardBody>
            <div className="text-sm font-semibold mb-2">
              Hoạt động ({s.activity.total})
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              {Object.entries(s.activity.byType).map(([t, c]) => (
                <div key={t} className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">{t}</div>
                  <div className="text-lg font-semibold text-slate-900">{c}</div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {s.newAccounts.length > 0 && (
        <Card>
          <CardBody>
            <div className="text-sm font-semibold mb-2">
              Accounts mới ({s.newAccounts.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {s.newAccounts.map((a) => (
                <Link
                  key={a.id}
                  to={`/crm/${a.id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs hover:border-brand-300"
                >
                  <span className="text-slate-800">{a.name}</span>
                  {a.industry && <span className="text-slate-500">· {a.industry}</span>}
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
          {icon}
          {title}
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

function StatBox({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone: "emerald" | "rose" | "brand";
}) {
  const toneMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-900 border-emerald-200",
    rose: "bg-rose-50 text-rose-900 border-rose-200",
    brand: "bg-brand-50 text-brand-900 border-brand-200",
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${toneMap[tone]}`}>
      <div className="text-[11px] uppercase opacity-70">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {sub && <div className="text-[11px] opacity-70">{sub}</div>}
    </div>
  );
}

function RowKV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{k}</span>
      <span className="text-slate-800">{v}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-slate-400 italic">{children}</div>;
}
