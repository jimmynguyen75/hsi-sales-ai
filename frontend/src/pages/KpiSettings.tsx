/**
 * KPI Settings — each sales rep sets their fiscal-year targets. Admin can
 * also review the whole team's targets vs achieved below the form.
 *
 * Targets:
 *   - revenue (doanh số ký HĐ, VND)
 *   - grossProfit (lãi gộp, VND)
 *   - newAccounts (số khách hàng mới)
 * "Achieved" comparison lives on the Dashboard; this page is just the setup.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target, Save, TrendingUp, Coins, UserPlus, Users, CalendarRange } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/Toast";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { formatVND } from "@/lib/format";
import type { KpiTarget } from "@/lib/types";

const FY = new Date().getFullYear();

interface TeamRow {
  userId: string;
  name: string;
  email: string;
  target: { revenue: number | null; grossProfit: number | null; newAccounts: number | null };
  achieved: { revenue: number; grossProfit: number; newAccounts: number };
}

// Format a number with vi-VN thousands separators for the raw input display.
function grp(n: number | null): string {
  return n != null && n > 0 ? n.toLocaleString("vi-VN") : "";
}
function parseNum(s: string): number | null {
  const cleaned = s.replace(/[^\d]/g, "");
  return cleaned ? parseInt(cleaned, 10) : null;
}

export function KpiSettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [revenue, setRevenue] = useState("");
  const [grossProfit, setGrossProfit] = useState("");
  const [newAccounts, setNewAccounts] = useState("");
  // FY window — HPT's fiscal year doesn't match the calendar year. Default
  // suggestion: Jul 1 this year → Jun 30 next year.
  const [fyStart, setFyStart] = useState(`${FY}-07-01`);
  const [fyEnd, setFyEnd] = useState(`${FY + 1}-06-30`);

  const { data: target } = useQuery({
    queryKey: ["kpi", FY],
    queryFn: () => api.get<KpiTarget>(`/kpi?fiscalYear=${FY}`),
  });

  useEffect(() => {
    if (!target) return;
    setRevenue(grp(target.revenueTarget));
    setGrossProfit(grp(target.grossProfitTarget));
    setNewAccounts(target.newAccountsTarget ? String(target.newAccountsTarget) : "");
    if (target.fyStart) setFyStart(target.fyStart.slice(0, 10));
    if (target.fyEnd) setFyEnd(target.fyEnd.slice(0, 10));
  }, [target]);

  const { data: team } = useQuery({
    queryKey: ["kpi-all", FY],
    queryFn: () => api.get<TeamRow[]>(`/kpi/all?fiscalYear=${FY}`),
    enabled: isAdmin,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      api.put<KpiTarget>("/kpi", {
        fiscalYear: FY,
        fyStart: fyStart ? new Date(fyStart).toISOString() : null,
        fyEnd: fyEnd ? new Date(fyEnd).toISOString() : null,
        revenueTarget: parseNum(revenue),
        grossProfitTarget: parseNum(grossProfit),
        newAccountsTarget: parseNum(newAccounts),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kpi", FY] });
      qc.invalidateQueries({ queryKey: ["kpi-progress", FY] });
      qc.invalidateQueries({ queryKey: ["kpi-all", FY] });
      toast.success("Đã lưu mục tiêu KPI");
    },
    onError: (e) => toast.error("Lưu thất bại", e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="p-6 space-y-4 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-400 to-orange-500" />
        <div className="flex items-center gap-3.5 px-6 py-4 pl-7">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-200">
            <Target className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Cài đặt KPI</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Đặt mục tiêu năm {FY}. Dashboard sẽ tự so sánh tiến độ đã đạt.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge className="bg-brand-50 text-brand-700 border border-brand-200">FY{FY}</Badge>
            <span className="text-sm font-medium text-slate-700">Mục tiêu của bạn</span>
          </div>

          {/* FY window — start/end dates. HPT's FY spans into next year. */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <CalendarRange className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Kỳ năm tài chính</span>
              <span className="text-[11px] text-slate-400">
                (FY của HPT không trùng năm dương lịch)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Ngày bắt đầu</Label>
                <input
                  type="date"
                  value={fyStart}
                  onChange={(e) => setFyStart(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <Label>Ngày kết thúc</Label>
                <input
                  type="date"
                  value={fyEnd}
                  onChange={(e) => setFyEnd(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiField
              icon={<TrendingUp className="h-4 w-4" />}
              tone="blue"
              label="Doanh số ký HĐ"
              suffix="₫"
              value={revenue}
              onChange={setRevenue}
              placeholder="VD: 15,000,000,000"
              hint={revenue ? formatVND(parseNum(revenue) ?? 0) : "Tổng giá trị hợp đồng cả năm"}
            />
            <KpiField
              icon={<Coins className="h-4 w-4" />}
              tone="emerald"
              label="Lãi gộp (LG)"
              suffix="₫"
              value={grossProfit}
              onChange={setGrossProfit}
              placeholder="VD: 2,000,000,000"
              hint={grossProfit ? formatVND(parseNum(grossProfit) ?? 0) : "Tổng lãi gộp mục tiêu"}
            />
            <KpiField
              icon={<UserPlus className="h-4 w-4" />}
              tone="violet"
              label="Khách hàng mới"
              suffix="KH"
              value={newAccounts}
              onChange={(v) => setNewAccounts(v.replace(/[^\d]/g, ""))}
              placeholder="VD: 20"
              hint="Số account mới tạo trong năm"
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending}>
              <Save className="h-4 w-4" />
              Lưu mục tiêu
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Admin: team overview */}
      {isAdmin && (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-brand-600" />
              KPI toàn team (FY{FY})
            </div>
            {(team?.length ?? 0) === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">Chưa có sales nào.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-2 font-medium">Sales</th>
                      <th className="text-right py-2 font-medium">Doanh số</th>
                      <th className="text-right py-2 font-medium">LG</th>
                      <th className="text-right py-2 font-medium">KH mới</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(team ?? []).map((r) => (
                      <tr key={r.userId} className="hover:bg-slate-50">
                        <td className="py-2">
                          <div className="font-medium text-slate-800">{r.name}</div>
                          <div className="text-[10px] text-slate-500">{r.email}</div>
                        </td>
                        <TeamCell achieved={r.achieved.revenue} target={r.target.revenue} money />
                        <TeamCell achieved={r.achieved.grossProfit} target={r.target.grossProfit} money />
                        <TeamCell achieved={r.achieved.newAccounts} target={r.target.newAccounts} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

const FIELD_TONES: Record<string, string> = {
  blue: "text-blue-600 bg-blue-50",
  emerald: "text-emerald-600 bg-emerald-50",
  violet: "text-violet-600 bg-violet-50",
};

function KpiField({
  icon,
  tone,
  label,
  suffix,
  value,
  onChange,
  placeholder,
  hint,
}: {
  icon: React.ReactNode;
  tone: keyof typeof FIELD_TONES;
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  // Reformat thousands separators for money-style fields on change.
  const handle = (raw: string) => {
    if (suffix === "₫") {
      const n = raw.replace(/[^\d]/g, "");
      onChange(n ? parseInt(n, 10).toLocaleString("vi-VN") : "");
    } else {
      onChange(raw);
    }
  };
  return (
    <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
      <div className="flex items-center gap-2">
        <span className={cn("h-7 w-7 rounded-lg grid place-items-center", FIELD_TONES[tone])}>
          {icon}
        </span>
        <Label className="!mb-0">{label}</Label>
      </div>
      <div className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 focus-within:ring-1 focus-within:ring-brand-500">
        <input
          value={value}
          onChange={(e) => handle(e.target.value)}
          placeholder={placeholder}
          inputMode="numeric"
          className="h-9 flex-1 bg-transparent text-right tabular-nums text-sm focus:outline-none"
        />
        <span className="text-xs text-slate-400 shrink-0">{suffix}</span>
      </div>
      {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

function TeamCell({
  achieved,
  target,
  money,
}: {
  achieved: number;
  target: number | null;
  money?: boolean;
}) {
  const pct = target && target > 0 ? Math.round((achieved / target) * 100) : null;
  const fmt = (n: number) =>
    money ? formatVND(n) : n.toLocaleString("vi-VN");
  return (
    <td className="py-2 text-right whitespace-nowrap">
      <div className="text-sm font-medium text-slate-800 tabular-nums">{fmt(achieved)}</div>
      <div className="text-[10px] text-slate-400 tabular-nums">
        {target ? (
          <>
            / {fmt(target)}
            {pct != null && (
              <span
                className={cn(
                  "ml-1 font-medium",
                  pct >= 100 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-rose-600",
                )}
              >
                {pct}%
              </span>
            )}
          </>
        ) : (
          <span className="italic">chưa đặt</span>
        )}
      </div>
    </td>
  );
}
