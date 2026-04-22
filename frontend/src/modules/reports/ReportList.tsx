import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { BarChart3, Calendar, FileText, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { SalesReport } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { formatDate, relativeTime } from "@/lib/format";

type ReportSummary = Pick<
  SalesReport,
  "id" | "title" | "period" | "startDate" | "endDate" | "createdAt"
>;

const PERIOD_LABEL: Record<string, string> = {
  week: "7 ngày",
  month: "1 tháng",
  quarter: "1 quý",
  custom: "Tùy chọn",
};

const PERIOD_COLOR: Record<string, string> = {
  week: "bg-blue-100 text-blue-700",
  month: "bg-indigo-100 text-indigo-700",
  quarter: "bg-purple-100 text-purple-700",
  custom: "bg-slate-100 text-slate-700",
};

export function ReportList() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [generating, setGenerating] = useState<"week" | "month" | "quarter" | null>(null);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.get<ReportSummary[]>("/reports"),
  });

  const genMut = useMutation({
    mutationFn: (period: "week" | "month" | "quarter") =>
      api.post<SalesReport>("/reports/generate", { period }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      nav(`/reports/${r.id}`);
    },
    onSettled: () => setGenerating(null),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.del<{ deleted: boolean }>(`/reports/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  const handleGenerate = (period: "week" | "month" | "quarter") => {
    setGenerating(period);
    genMut.mutate(period);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand-600" />
            Sales Report Auto-Generator
          </h1>
          <p className="text-sm text-slate-500">
            AI tổng hợp pipeline, kết quả closed, top deals và đề xuất hành động theo kỳ.
          </p>
        </div>
      </div>

      <Card>
        <CardBody>
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-800">
            <Sparkles className="h-4 w-4 text-brand-600" />
            Tạo report mới
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["week", "month", "quarter"] as const).map((p) => (
              <button
                key={p}
                onClick={() => handleGenerate(p)}
                disabled={genMut.isPending}
                className="group rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-semibold text-slate-800 group-hover:text-brand-700">
                    {p === "week" ? "Tuần qua" : p === "month" ? "Tháng qua" : "Quý qua"}
                  </div>
                  <Badge className={PERIOD_COLOR[p]}>{PERIOD_LABEL[p]}</Badge>
                </div>
                <div className="text-xs text-slate-500">
                  {generating === p
                    ? "AI đang tổng hợp..."
                    : `Báo cáo đầy đủ pipeline + closed + hoạt động`}
                </div>
              </button>
            ))}
          </div>
          {genMut.error && (
            <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {(genMut.error as Error).message}
            </div>
          )}
        </CardBody>
      </Card>

      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 px-1">
          Lịch sử ({reports?.length ?? 0})
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {isLoading && (
            <Card>
              <CardBody className="text-sm text-slate-500">Đang tải...</CardBody>
            </Card>
          )}
          {!isLoading && (reports?.length ?? 0) === 0 && (
            <Card>
              <CardBody className="text-sm text-slate-500">
                Chưa có report nào. Bấm Tạo report mới ở trên.
              </CardBody>
            </Card>
          )}
          {(reports ?? []).map((r) => (
            <Card key={r.id} className="hover:border-brand-300 hover:shadow-md transition">
              <CardBody>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Link to={`/reports/${r.id}`} className="font-medium text-sm line-clamp-2 hover:text-brand-700">
                    {r.title}
                  </Link>
                  <Badge className={PERIOD_COLOR[r.period] ?? "bg-slate-100 text-slate-700"}>
                    {PERIOD_LABEL[r.period] ?? r.period}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {formatDate(r.startDate)} → {formatDate(r.endDate)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <FileText className="h-3.5 w-3.5" />
                  <span>Tạo {relativeTime(r.createdAt)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Link
                    to={`/reports/${r.id}`}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                  >
                    Xem chi tiết →
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm(`Xóa "${r.title}"?`)) delMut.mutate(r.id);
                    }}
                    className="text-slate-400 hover:text-rose-600 transition"
                    title="Xóa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
