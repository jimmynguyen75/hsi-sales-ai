import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  RefreshCw,
  Calendar,
  Mail,
  Users,
  Clock,
  TrendingUp,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import type { DailyBriefing as BriefingType } from "@/lib/types";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDate, formatVND, relativeTime } from "@/lib/format";

export function DailyBriefing() {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<string | null>(null);

  const { data: today, isLoading } = useQuery({
    queryKey: ["briefing", "today"],
    queryFn: () => api.get<BriefingType>("/briefing/today"),
  });

  const { data: history } = useQuery({
    queryKey: ["briefing", "history"],
    queryFn: () => api.get<Array<{ id: string; date: string; isRead: boolean; createdAt: string }>>("/briefing/history"),
  });

  const { data: detail } = useQuery({
    queryKey: ["briefing", viewing],
    queryFn: () => api.get<BriefingType>(`/briefing/${viewing}`),
    enabled: !!viewing,
  });

  const regen = useMutation({
    mutationFn: () => api.post<BriefingType>("/briefing/generate"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["briefing", "today"] });
      qc.invalidateQueries({ queryKey: ["briefing", "history"] });
    },
  });

  const current = viewing ? detail : today;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-600" />
            Daily Sales Briefing
          </h1>
          <p className="text-sm text-slate-500">
            AI tổng hợp mỗi sáng — follow-ups, meetings, deals sắp hết hạn, pipeline.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          loading={regen.isPending}
          onClick={() => {
            setViewing(null);
            regen.mutate();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Tạo lại hôm nay
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {isLoading && !current ? (
            <Card>
              <CardBody className="py-16 text-center text-sm text-slate-500">
                AI đang tạo briefing hôm nay...
              </CardBody>
            </Card>
          ) : current ? (
            <BriefingView briefing={current} isToday={!viewing} />
          ) : (
            <Card>
              <CardBody className="py-16 text-center text-sm text-slate-400">
                Chưa có briefing.
              </CardBody>
            </Card>
          )}
          {regen.error && (
            <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {(regen.error as Error).message}
            </div>
          )}
        </div>

        <aside className="space-y-2">
          <div className="text-xs uppercase text-slate-500 tracking-wide mb-2 px-1">
            Lịch sử (30 ngày)
          </div>
          <button
            onClick={() => setViewing(null)}
            className={
              "w-full text-left rounded-lg border px-3 py-2 transition " +
              (!viewing
                ? "border-brand-300 bg-brand-50/60"
                : "border-slate-200 bg-white hover:border-slate-300")
            }
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-brand-600" />
              <span className="text-sm font-medium">Hôm nay</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {formatDate(new Date())}
            </div>
          </button>
          {(history ?? [])
            .filter((h) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return new Date(h.date).getTime() < today.getTime();
            })
            .map((h) => (
              <button
                key={h.id}
                onClick={() => setViewing(h.id)}
                className={
                  "w-full text-left rounded-lg border px-3 py-2 transition " +
                  (viewing === h.id
                    ? "border-brand-300 bg-brand-50/60"
                    : "border-slate-200 bg-white hover:border-slate-300")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{formatDate(h.date)}</div>
                  {!h.isRead && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {relativeTime(h.createdAt)}
                </div>
              </button>
            ))}
        </aside>
      </div>
    </div>
  );
}

function BriefingView({ briefing, isToday }: { briefing: BriefingType; isToday: boolean }) {
  const s = briefing.sections;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-3">
            <div>
              <Badge className="bg-brand-50 text-brand-700">
                {isToday ? "Hôm nay" : formatDate(briefing.date)}
              </Badge>
              <div className="text-xs text-slate-500 mt-1">
                Tạo lúc {new Date(briefing.createdAt).toLocaleString("vi-VN")}
              </div>
            </div>
          </div>
          <div className="prose-hsi text-slate-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.content}</ReactMarkdown>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <SectionCard icon={<Mail className="h-4 w-4 text-amber-600" />} title="Follow-ups hôm nay" count={s.followUps.length}>
          {s.followUps.length === 0 ? (
            <Empty>Không có follow-up.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {s.followUps.map((f) => (
                <li key={f.id} className="text-sm flex items-start gap-2">
                  <span className="text-slate-800">{f.subject}</span>
                  {f.accountName && <span className="text-xs text-slate-500">· {f.accountName}</span>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard icon={<Users className="h-4 w-4 text-blue-600" />} title="Meetings hôm nay" count={s.meetings.length}>
          {s.meetings.length === 0 ? (
            <Empty>Không có meeting.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {s.meetings.map((m) => (
                <li key={m.id} className="text-sm">
                  <Link to={`/meetings/${m.id}`} className="text-slate-800 hover:text-brand-600">
                    {m.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {new Date(m.date).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                    {m.accountName && ` · ${m.accountName}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          icon={<AlertCircle className="h-4 w-4 text-rose-600" />}
          title="Deals sắp đóng"
          count={s.expiringDeals.length}
        >
          {s.expiringDeals.length === 0 ? (
            <Empty>Không có deal nào sắp hết hạn.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {s.expiringDeals.map((d) => (
                <li key={d.id} className="text-sm flex items-start justify-between gap-2">
                  <div>
                    <div className="text-slate-800">{d.title}</div>
                    <div className="text-xs text-slate-500">
                      {d.accountName && `${d.accountName} · `}
                      {d.expectedClose && formatDate(d.expectedClose)}
                    </div>
                  </div>
                  <span className="text-xs text-slate-600 shrink-0">{formatVND(d.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} title="Pipeline snapshot">
          <div className="text-2xl font-semibold text-slate-900 mb-2">
            {formatVND(s.pipelineSnapshot.totalValue)}
          </div>
          <div className="space-y-1">
            {Object.entries(s.pipelineSnapshot.byStage).map(([stage, v]) => (
              <div key={stage} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{stage}</span>
                <span className="text-slate-800">
                  {v.count} · {formatVND(v.value)}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {s.recentActivity.length > 0 && (
        <Card>
          <CardBody>
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
              <Clock className="h-4 w-4 text-slate-600" />
              Hoạt động gần đây
            </div>
            <ul className="space-y-1">
              {s.recentActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-xs text-slate-600">
                  <span>
                    <Badge className="bg-slate-100 text-slate-700 mr-2">{a.type}</Badge>
                    {a.subject}
                  </span>
                  <span className="text-slate-400">{relativeTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function SectionCard({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {title}
          </div>
          {typeof count === "number" && (
            <Badge className="bg-slate-100 text-slate-600">{count}</Badge>
          )}
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-slate-400 italic">{children}</div>;
}
