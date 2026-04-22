import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Filter, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { Account } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatVND, relativeTime, healthColor, healthLabel } from "@/lib/format";
import { AccountDialog } from "./AccountDialog";
import { BulkImportDialog } from "@/components/BulkImportDialog";

type SortKey = "companyName" | "healthScore" | "updatedAt";
type SortDir = "asc" | "desc";

export function AccountList() {
  const qc = useQueryClient();
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
      let av: string | number | Date = "";
      let bv: string | number | Date = "";
      if (sortKey === "companyName") {
        av = a.companyName;
        bv = b.companyName;
      } else if (sortKey === "healthScore") {
        av = a.healthScore ?? 0;
        bv = b.healthScore ?? 0;
      } else {
        av = new Date(a.updatedAt);
        bv = new Date(b.updatedAt);
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
      setSortDir("asc");
    }
  }

  const SortTh = ({ label, sk }: { label: string; sk: SortKey }) => (
    <th
      onClick={() => toggleSort(sk)}
      className="cursor-pointer select-none px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500 hover:text-slate-800"
    >
      {label}
      {sortKey === sk && <span className="ml-1 text-brand-500">{sortDir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Smart CRM</h1>
          <p className="text-sm text-slate-500">
            Quản lý accounts, deals, activities với AI assistant.
          </p>
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

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Tìm theo tên công ty, notes..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
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
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <Filter className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <SortTh label="Công ty" sk="companyName" />
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">Industry</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">Deals</th>
                <SortTh label="Health" sk="healthScore" />
                <SortTh label="Cập nhật" sk="updatedAt" />
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">AI Suggestion</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                    Đang tải...
                  </td>
                </tr>
              )}
              {!isLoading && sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                    Chưa có account nào.
                  </td>
                </tr>
              )}
              {sorted.map((a) => {
                const suggestion = a.insights?.[0]?.content;
                return (
                  <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/crm/${a.id}`}
                        className="font-medium text-slate-900 hover:text-brand-600"
                      >
                        {a.companyName}
                      </Link>
                      {a.size && <div className="text-[11px] text-slate-500">{a.size}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.industry ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{a._count?.deals ?? 0}</td>
                    <td className="px-4 py-3">
                      <Badge className={healthColor(a.healthScore)}>
                        {a.healthScore ?? "—"} · {healthLabel(a.healthScore)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{relativeTime(a.updatedAt)}</td>
                    <td className="px-4 py-3 max-w-[280px] truncate text-slate-500 italic">
                      {suggestion?.slice(0, 80) ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-slate-500">Tổng accounts</div>
          <div className="text-2xl font-semibold mt-0.5">{sorted.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Healthy</div>
          <div className="text-2xl font-semibold mt-0.5 text-emerald-600">
            {sorted.filter((a) => (a.healthScore ?? 0) >= 75).length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">At risk</div>
          <div className="text-2xl font-semibold mt-0.5 text-rose-600">
            {sorted.filter((a) => (a.healthScore ?? 100) < 55).length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Avg Health</div>
          <div className="text-2xl font-semibold mt-0.5">
            {sorted.length
              ? Math.round(
                  sorted.reduce((s, a) => s + (a.healthScore ?? 0), 0) / sorted.length,
                )
              : "—"}
          </div>
        </Card>
      </div>

      {/* Dummy VND for tree-shake guard (referenced below if deals present) */}
      <span className="hidden">{formatVND(0)}</span>

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
