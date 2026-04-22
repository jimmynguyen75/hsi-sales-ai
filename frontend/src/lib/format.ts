export function formatVND(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B ₫`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M ₫`;
  return `${value.toLocaleString("vi-VN")} ₫`;
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function relativeTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "hôm nay";
  if (days === 1) return "hôm qua";
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  if (days < 365) return `${Math.floor(days / 30)} tháng trước`;
  return `${Math.floor(days / 365)} năm trước`;
}

export function healthColor(score: number | null | undefined): string {
  if (score == null) return "bg-slate-200 text-slate-700";
  if (score >= 75) return "bg-emerald-100 text-emerald-800";
  if (score >= 55) return "bg-amber-100 text-amber-800";
  if (score >= 35) return "bg-orange-100 text-orange-800";
  return "bg-rose-100 text-rose-800";
}

export function healthLabel(score: number | null | undefined): string {
  if (score == null) return "—";
  if (score >= 75) return "Healthy";
  if (score >= 55) return "Watch";
  if (score >= 35) return "At risk";
  return "Critical";
}

export function stageColor(stage: string): string {
  const map: Record<string, string> = {
    prospecting: "bg-slate-100 text-slate-700",
    qualification: "bg-blue-100 text-blue-700",
    proposal: "bg-indigo-100 text-indigo-700",
    negotiation: "bg-amber-100 text-amber-800",
    closed_won: "bg-emerald-100 text-emerald-800",
    closed_lost: "bg-rose-100 text-rose-800",
  };
  return map[stage] ?? "bg-slate-100 text-slate-700";
}
