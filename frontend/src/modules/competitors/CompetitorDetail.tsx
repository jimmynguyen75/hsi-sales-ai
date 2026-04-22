import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  Plus,
  Sparkles,
  Swords,
  Trash2,
  Save,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import type { Competitor, CompetitorIntel } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { formatVND, relativeTime } from "@/lib/format";

const INTEL_TYPES = [
  { value: "news", label: "Tin tức", color: "bg-blue-100 text-blue-700" },
  { value: "pricing", label: "Giá", color: "bg-amber-100 text-amber-800" },
  { value: "win_against", label: "HSI thắng", color: "bg-emerald-100 text-emerald-800" },
  { value: "loss_to", label: "HSI thua", color: "bg-rose-100 text-rose-700" },
  { value: "rumor", label: "Tin đồn", color: "bg-slate-100 text-slate-700" },
  { value: "feature", label: "Tính năng", color: "bg-indigo-100 text-indigo-700" },
] as const;

const IMPACT_COLOR: Record<string, string> = {
  high: "bg-rose-100 text-rose-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-600",
};

export function CompetitorDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [showIntelForm, setShowIntelForm] = useState(false);

  const { data: c, isLoading } = useQuery({
    queryKey: ["competitor", id],
    queryFn: () => api.get<Competitor>(`/competitors/${id}`),
    enabled: !!id,
  });

  const updateMut = useMutation({
    mutationFn: (body: Partial<Competitor>) => api.put<Competitor>(`/competitors/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitor", id] });
      qc.invalidateQueries({ queryKey: ["competitors"] });
      setEditing(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.del<{ deleted: boolean }>(`/competitors/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitors"] });
      nav("/competitors");
    },
  });

  const analyzeMut = useMutation({
    mutationFn: () => api.post<Competitor>(`/competitors/${id}/analyze`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitor", id] }),
  });

  const delIntelMut = useMutation({
    mutationFn: (intelId: string) =>
      api.del<{ deleted: boolean }>(`/competitors/${id}/intel/${intelId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitor", id] }),
  });

  if (isLoading) return <div className="p-6 text-sm text-slate-500">Đang tải...</div>;
  if (!c) return <div className="p-6 text-sm text-slate-500">Không tìm thấy đối thủ.</div>;

  return (
    <div className="p-6 space-y-4 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <Link
          to="/competitors"
          className="text-sm text-slate-600 hover:text-brand-700 flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Về danh sách
        </Link>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            loading={analyzeMut.isPending}
            onClick={() => analyzeMut.mutate()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI SWOT
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm(`Xóa đối thủ "${c.name}"?`)) deleteMut.mutate();
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
          </Button>
        </div>
      </div>

      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <Swords className="h-5 w-5 text-brand-600" />
                {c.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                {c.vendor && <Badge className="bg-slate-100 text-slate-700">{c.vendor}</Badge>}
                {c.website && (
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {c.website.replace(/^https?:\/\//, "").slice(0, 32)}
                  </a>
                )}
                <span className="text-xs text-slate-400">
                  · cập nhật {relativeTime(c.updatedAt)}
                </span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? "Đóng" : "Sửa"}
            </Button>
          </div>

          {editing ? (
            <CompetitorEditForm
              competitor={c}
              onSave={(body) => updateMut.mutate(body)}
              saving={updateMut.isPending}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <KVBox title="Strengths" value={c.strengths} />
              <KVBox title="Weaknesses" value={c.weaknesses} />
              <KVBox title="Pricing" value={c.pricing} />
              <KVBox title="Notes" value={c.notes} />
            </div>
          )}
        </CardBody>
      </Card>

      {c.swotAnalysis && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-brand-600" />
                AI SWOT Analysis
              </div>
              <span className="text-xs text-slate-500">
                {c.swotAt && `Cập nhật ${relativeTime(c.swotAt)}`}
              </span>
            </div>
            <div className="prose-hsi text-slate-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.swotAnalysis}</ReactMarkdown>
            </div>
          </CardBody>
        </Card>
      )}

      {analyzeMut.error && (
        <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {(analyzeMut.error as Error).message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Intel timeline ({c.intel?.length ?? 0})</div>
              <Button size="sm" variant="outline" onClick={() => setShowIntelForm((v) => !v)}>
                <Plus className="h-3.5 w-3.5" />
                Thêm intel
              </Button>
            </div>

            {showIntelForm && (
              <IntelForm
                competitorId={c.id}
                onDone={() => {
                  setShowIntelForm(false);
                  qc.invalidateQueries({ queryKey: ["competitor", id] });
                }}
              />
            )}

            {(c.intel?.length ?? 0) === 0 ? (
              <div className="text-xs text-slate-400 italic">
                Chưa có intel. Thêm news, pricing, win/loss để AI phân tích tốt hơn.
              </div>
            ) : (
              <ul className="space-y-2">
                {(c.intel ?? []).map((i) => (
                  <IntelRow
                    key={i.id}
                    intel={i}
                    onDelete={() => {
                      if (confirm("Xóa intel này?")) delIntelMut.mutate(i.id);
                    }}
                  />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-sm font-semibold mb-3">
              Deals đối đầu ({c.competingDeals?.length ?? 0})
            </div>
            {(c.competingDeals?.length ?? 0) === 0 ? (
              <div className="text-xs text-slate-400 italic">
                Link deal với đối thủ này để theo dõi win/loss.
              </div>
            ) : (
              <ul className="space-y-2">
                {(c.competingDeals ?? []).map((d) => (
                  <li key={d.id} className="text-sm border-b border-slate-100 pb-2 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-slate-800">{d.title}</div>
                        <div className="text-xs text-slate-500 truncate">
                          {d.account?.companyName}
                          {d.vendor && ` · ${d.vendor}`}
                        </div>
                      </div>
                      <Badge
                        className={
                          d.stage === "closed_won"
                            ? "bg-emerald-100 text-emerald-800"
                            : d.stage === "closed_lost"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-slate-100 text-slate-700"
                        }
                      >
                        {d.stage.replace("closed_", "")}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{formatVND(d.value)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function CompetitorEditForm({
  competitor,
  onSave,
  saving,
}: {
  competitor: Competitor;
  onSave: (body: Partial<Competitor>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    name: competitor.name,
    vendor: competitor.vendor ?? "",
    website: competitor.website ?? "",
    strengths: competitor.strengths ?? "",
    weaknesses: competitor.weaknesses ?? "",
    pricing: competitor.pricing ?? "",
    notes: competitor.notes ?? "",
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Tên</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="strengths">Strengths</Label>
        <Textarea
          id="strengths"
          rows={2}
          value={form.strengths}
          onChange={(e) => setForm({ ...form, strengths: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="weaknesses">Weaknesses</Label>
        <Textarea
          id="weaknesses"
          rows={2}
          value={form.weaknesses}
          onChange={(e) => setForm({ ...form, weaknesses: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="pricing">Pricing</Label>
        <Textarea
          id="pricing"
          rows={2}
          value={form.pricing}
          onChange={(e) => setForm({ ...form, pricing: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          loading={saving}
          onClick={() =>
            onSave({
              ...form,
              vendor: form.vendor || null,
              website: form.website || null,
              strengths: form.strengths || null,
              weaknesses: form.weaknesses || null,
              pricing: form.pricing || null,
              notes: form.notes || null,
            } as Partial<Competitor>)
          }
        >
          <Save className="h-3.5 w-3.5" />
          Lưu
        </Button>
      </div>
    </div>
  );
}

function IntelForm({
  competitorId,
  onDone,
}: {
  competitorId: string;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    type: "news" as CompetitorIntel["type"],
    content: "",
    source: "",
    impact: "medium" as "high" | "medium" | "low",
  });

  const addMut = useMutation({
    mutationFn: (body: typeof form) =>
      api.post<CompetitorIntel>(`/competitors/${competitorId}/intel`, body),
    onSuccess: () => {
      setForm({ type: "news", content: "", source: "", impact: "medium" });
      onDone();
    },
  });

  return (
    <div className="mb-4 rounded-md border border-slate-200 bg-slate-50/50 p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <Label>Loại</Label>
          <select
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            value={form.type}
            onChange={(e) =>
              setForm({ ...form, type: e.target.value as CompetitorIntel["type"] })
            }
          >
            {INTEL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Impact</Label>
          <select
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            value={form.impact}
            onChange={(e) =>
              setForm({ ...form, impact: e.target.value as "high" | "medium" | "low" })
            }
          >
            <option value="high">Cao</option>
            <option value="medium">Trung bình</option>
            <option value="low">Thấp</option>
          </select>
        </div>
        <div>
          <Label>Source</Label>
          <Input
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="ITCnews, LinkedIn, nội bộ..."
          />
        </div>
      </div>
      <div>
        <Label>Nội dung *</Label>
        <Textarea
          rows={2}
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder="VD: FPT IS vừa ký deal 15 tỷ với Vietcombank về Palo Alto firewalls..."
        />
      </div>
      {addMut.error && (
        <div className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">
          {(addMut.error as Error).message}
        </div>
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          loading={addMut.isPending}
          disabled={!form.content.trim()}
          onClick={() => addMut.mutate(form)}
        >
          Thêm
        </Button>
      </div>
    </div>
  );
}

function IntelRow({
  intel,
  onDelete,
}: {
  intel: CompetitorIntel;
  onDelete: () => void;
}) {
  const typeMeta = INTEL_TYPES.find((t) => t.value === intel.type);
  return (
    <li className="border-b border-slate-100 pb-2 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge className={typeMeta?.color ?? "bg-slate-100 text-slate-700"}>
            {typeMeta?.label ?? intel.type}
          </Badge>
          {intel.impact && (
            <Badge className={IMPACT_COLOR[intel.impact]}>{intel.impact}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">{relativeTime(intel.createdAt)}</span>
          <button onClick={onDelete} className="text-slate-400 hover:text-rose-600">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="text-sm text-slate-800 mt-1">{intel.content}</div>
      {intel.source && (
        <div className="text-[11px] text-slate-500 mt-0.5">Nguồn: {intel.source}</div>
      )}
    </li>
  );
}

function KVBox({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{title}</div>
      {value ? (
        <div className="text-sm text-slate-800 whitespace-pre-line">{value}</div>
      ) : (
        <div className="text-xs text-slate-400 italic">—</div>
      )}
    </div>
  );
}
