/**
 * Smart CRM — account list.
 *
 * Presentation-grade layout matching Dashboard + Pipeline: gradient hero
 * band, gradient KPI cards, polished searchable/sortable table with
 * company avatars and health badges. Data logic unchanged — server
 * scopes accounts by owner (RBAC), admin sees everyone's.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Plus,
  Upload,
  Search,
  Users,
  HeartPulse,
  AlertTriangle,
  Gauge,
  Building2,
  ArrowUpDown,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Account } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Badge, Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { relativeTime, healthColor, healthLabel } from "@/lib/format";
import { AccountDialog } from "./AccountDialog";
import { BulkImportDialog } from "@/components/BulkImportDialog";

type SortKey = "companyName" | "healthScore" | "updatedAt" | "deals";
type SortDir = "asc" | "desc";

// Deterministic pastel for the company avatar — hash the name into one of
// eight tailwind color pairs so the same account always gets the same hue.
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const STAT_TONES: Record<string, { card: string; icon: string; value: string }> = {
  blue: {
    card: "bg-gradient-to-br from-blue-50 to-white border-blue-100",
    icon: "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-200",
    value: "text-blue-900",
  },
  emerald: {
    card: "bg-gradient-to-br from-emerald-50 to-white border-emerald-100",
    icon: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-200",
    value: "text-emerald-900",
  },
  rose: {
    card: "bg-gradient-to-br from-rose-50 to-white border-rose-100",
    icon: "bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-md shadow-rose-200",
    value: "text-rose-900",
  },
  violet: {
    card: "bg-gradient-to-br from-violet-50 to-white border-violet-100",
    icon: "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-200",
    value: "text-violet-900",
  },
};

export function AccountList() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState("");
  const [minHealth, setMinHealth] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["accounts", { q, industry, minHealth }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (industry) p.set("industry", industry);
      if (minHealth) p.set("minHealth", minHealth);
      return api.get<Account[]>(`/accounts?${p.toString()}`);
    },
  });

  const industries = useMemo(
    () => Array.from(new Set((data ?? []).map((a) => a.industry).filter(Boolean))) as string[],
    [data],
  );

  const sorted = useMemo(() => {
    const list = [...(data ?? [])];
    list.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "companyName") {
        av = a.companyName;
        bv = b.companyName;
      } else if (sortKey === "healthScore") {
        av = a.healthScore ?? 0;
        bv = b.healthScore ?? 0;
      } else if (sortKey === "deals") {
        av = a._count?.deals ?? 0;
        bv = b._count?.deals ?? 0;
      } else {
        av = +new Date(a.updatedAt);
        bv = +new Date(b.updatedAt);
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [data, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "companyName" ? "asc" : "desc");
    }
  }

  const totalDeals = sorted.reduce((s, a) => s + (a._count?.deals ?? 0), 0);
  const healthyCount = sorted.filter((a) => (a.healthScore ?? 0) >= 75).length;
  const atRiskCount = sorted.filter((a) => (a.healthScore ?? 100) < 55).length;
  const avgHealth = sorted.length
    ? Math.round(sorted.reduce((s, a) => s + (a.healthScore ?? 0), 0) / sorted.length)
    : null;

  const SortTh = ({
    label,
    sk,
    className,
  }: {
    label: string;
    sk: SortKey;
    className?: string;
  }) => (
    <th
      onClick={() => toggleSort(sk)}
      className={cn(
        "cursor-pointer select-none px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sk ? (
          <span className="text-brand-600">{sortDir === "asc" ? "↑" : "↓"}</span>
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-300" />
        )}
      </span>
    </th>
  );

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* ===== Header — clean white "working page" style with an emerald
             icon tile + left accent, distinct from the Dashboard hero. ===== */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-emerald-500 to-teal-600" />
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 pl-7">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-200">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Smart CRM</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Quản lý khách hàng, deals và activities — có AI assistant hỗ trợ.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" />
              Thêm account
            </Button>
          </div>
        </div>
      </div>

      {/* ===== KPI strip ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Tổng accounts"
          value={sorted.length.toString()}
          hint={`${totalDeals} deals đang gắn`}
          tone="blue"
        />
        <StatCard
          icon={<HeartPulse className="h-5 w-5" />}
          label="Healthy"
          value={healthyCount.toString()}
          hint="health score ≥ 75"
          tone="emerald"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="At risk"
          value={atRiskCount.toString()}
          hint="health score < 55"
          tone="rose"
        />
        <StatCard
          icon={<Gauge className="h-5 w-5" />}
          label="Avg health"
          value={avgHealth != null ? avgHealth.toString() : "—"}
          hint="trung bình toàn bộ"
          tone="violet"
        />
      </div>

      {/* ===== Filter bar ===== */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-[420px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Tìm theo tên công ty, notes..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="">Mọi industry</option>
            {industries.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <select
            value={minHealth}
            onChange={(e) => setMinHealth(e.target.value)}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="">Mọi health</option>
            <option value="75">Healthy (≥75)</option>
            <option value="55">Watch+ (≥55)</option>
            <option value="35">At risk+ (≥35)</option>
          </select>
          {(q || industry || minHealth) && (
            <button
              onClick={() => {
                setQ("");
                setIndustry("");
                setMinHealth("");
              }}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              xoá lọc
            </button>
          )}
          <div className="ml-auto text-[11px] text-slate-400">
            {isLoading ? "Đang tải..." : `${sorted.length} accounts`}
          </div>
        </div>
      </Card>

      {/* ===== Table ===== */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <SortTh label="Công ty" sk="companyName" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Industry
                </th>
                {isAdmin && (
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Owner
                  </th>
                )}
                <SortTh label="Deals" sk="deals" />
                <SortTh label="Health" sk="healthScore" />
                <SortTh label="Cập nhật" sk="updatedAt" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-brand-500" />
                    AI Suggestion
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-10 text-center text-slate-400 text-sm">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!isLoading && sorted.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-12 text-center text-slate-400 text-sm">
                    Chưa có account nào. Bấm "Thêm account" để bắt đầu.
                  </td>
                </tr>
              )}
              {sorted.map((a) => {
                const suggestion = a.insights?.[0]?.content;
                return (
                  <tr key={a.id} className="hover:bg-blue-50/40 transition group">
                    <td className="px-4 py-3">
                      <Link to={`/crm/${a.id}`} className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold uppercase",
                            avatarColor(a.companyName),
                          )}
                        >
                          {a.companyName.charAt(0)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900 group-hover:text-brand-700 transition truncate max-w-[280px]">
                            {a.companyName}
                          </span>
                          {a.size && (
                            <span className="block text-[11px] text-slate-500">{a.size}</span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {a.industry ? (
                        <Badge className="bg-slate-100 text-slate-700">{a.industry}</Badge>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-slate-600">
                        {a.owner ? (
                          <span
                            className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700"
                            title={a.owner.email}
                          >
                            {a.owner.name}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
                          (a._count?.deals ?? 0) > 0
                            ? "bg-brand-50 text-brand-700"
                            : "bg-slate-50 text-slate-400",
                        )}
                      >
                        {a._count?.deals ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn("border", healthColor(a.healthScore))}>
                        {a.healthScore ?? "—"} · {healthLabel(a.healthScore)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {relativeTime(a.updatedAt)}
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      {suggestion ? (
                        <span className="block truncate text-xs text-slate-500 italic" title={suggestion}>
                          {suggestion.slice(0, 90)}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AccountDialog open={newOpen} onClose={() => setNewOpen(false)} onSaved={() => refetch()} />

      {importOpen && (
        <BulkImportDialog
          title="Import accounts từ CSV"
          endpoint="/import/accounts"
          sampleDownloadPath="/import/sample/accounts.csv"
          expectedColumns={[
            "companyName",
            "industry",
            "size",
            "website",
            "address",
            "notes",
          ]}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            qc.invalidateQueries({ queryKey: ["accounts"] });
          }}
        />
      )}
    </div>
  );
}

function StatCard({
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
  tone: keyof typeof STAT_TONES;
}) {
  const t = STAT_TONES[tone];
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
