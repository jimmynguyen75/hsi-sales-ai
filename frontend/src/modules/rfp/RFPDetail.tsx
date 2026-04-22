import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Printer,
  Sparkles,
  Wand2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Save,
  Pencil,
} from "lucide-react";
import { api } from "@/lib/api";
import type { RFPRequirement, RFPResponse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { formatDate, relativeTime } from "@/lib/format";

const CATEGORY_LABEL: Record<string, string> = {
  functional: "Chức năng",
  technical: "Kỹ thuật",
  security: "Bảo mật",
  commercial: "Thương mại",
  timeline: "Tiến độ",
  support: "Support",
  compliance: "Tuân thủ",
  other: "Khác",
};

const CATEGORY_COLOR: Record<string, string> = {
  functional: "bg-blue-100 text-blue-700",
  technical: "bg-indigo-100 text-indigo-700",
  security: "bg-rose-100 text-rose-700",
  commercial: "bg-amber-100 text-amber-800",
  timeline: "bg-purple-100 text-purple-700",
  support: "bg-emerald-100 text-emerald-800",
  compliance: "bg-slate-100 text-slate-700",
  other: "bg-slate-100 text-slate-600",
};

const PRIORITY_COLOR: Record<string, string> = {
  must: "bg-rose-100 text-rose-700",
  should: "bg-amber-100 text-amber-800",
  nice: "bg-slate-100 text-slate-600",
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-rose-100 text-rose-700",
};

export function RFPDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingHeader, setEditingHeader] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const { data: rfp, isLoading } = useQuery({
    queryKey: ["rfp", id],
    queryFn: () => api.get<RFPResponse>(`/rfp/${id}`),
    enabled: !!id,
  });

  const extractMut = useMutation({
    mutationFn: () => api.post<RFPResponse>(`/rfp/${id}/extract`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rfp", id] }),
  });

  const respondAllMut = useMutation({
    mutationFn: () =>
      api.post<{ drafted: number; skipped: number; errors: number; rfp: RFPResponse }>(
        `/rfp/${id}/respond-all?limit=8`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rfp", id] }),
  });

  const respondOneMut = useMutation({
    mutationFn: (reqId: string) => api.post<RFPResponse>(`/rfp/${id}/respond/${reqId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rfp", id] }),
  });

  const updateHeaderMut = useMutation({
    mutationFn: (body: Partial<RFPResponse>) => api.put<RFPResponse>(`/rfp/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfp", id] });
      setEditingHeader(false);
    },
  });

  const editReqMut = useMutation({
    mutationFn: ({ reqId, patch }: { reqId: string; patch: Partial<RFPRequirement> }) =>
      api.put<RFPResponse>(`/rfp/${id}/requirement/${reqId}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rfp", id] }),
  });

  if (isLoading) return <div className="p-6 text-sm text-slate-500">Đang tải RFP...</div>;
  if (!rfp) return <div className="p-6 text-sm text-slate-500">Không tìm thấy RFP.</div>;

  const toggle = (reqId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(reqId)) next.delete(reqId);
      else next.add(reqId);
      return next;
    });
  };

  const reqs = rfp.requirements ?? [];
  const drafted = reqs.filter((r) => r.response && r.status !== "pending").length;
  const approved = reqs.filter((r) => r.status === "approved").length;

  return (
    <div className="p-6 space-y-4 max-w-[1280px] mx-auto">
      <div className="flex items-center justify-between print:hidden">
        <Link
          to="/rfp"
          className="text-sm text-slate-600 hover:text-brand-700 flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Về danh sách
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            In / PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardBody>
          {editingHeader ? (
            <HeaderEdit
              rfp={rfp}
              onSave={(body) => updateHeaderMut.mutate(body)}
              onCancel={() => setEditingHeader(false)}
              saving={updateHeaderMut.isPending}
            />
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-brand-600" />
                  {rfp.title}
                </h1>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  {rfp.clientName && <span>Khách hàng: {rfp.clientName}</span>}
                  {rfp.deadline && (
                    <>
                      <span>·</span>
                      <span>Deadline {formatDate(rfp.deadline)}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>Cập nhật {relativeTime(rfp.updatedAt)}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditingHeader(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Sửa
              </Button>
            </div>
          )}

          <div className="mt-4 grid grid-cols-4 gap-3">
            <Stat label="Tổng yêu cầu" value={reqs.length} />
            <Stat label="Đã draft" value={drafted} tone="brand" />
            <Stat label="Đã duyệt" value={approved} tone="emerald" />
            <Stat
              label="Tiến độ"
              value={`${reqs.length ? Math.round((drafted / reqs.length) * 100) : 0}%`}
              tone="amber"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
            {reqs.length === 0 && (
              <Button
                loading={extractMut.isPending}
                disabled={!rfp.rawContent?.trim()}
                onClick={() => extractMut.mutate()}
              >
                <Wand2 className="h-3.5 w-3.5" />
                AI extract yêu cầu
              </Button>
            )}
            {reqs.length > 0 && (
              <>
                <Button
                  loading={respondAllMut.isPending}
                  onClick={() => respondAllMut.mutate()}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Draft tất cả (8 items)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  loading={extractMut.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        "Extract lại sẽ ghi đè toàn bộ yêu cầu hiện tại. Tiếp tục?",
                      )
                    )
                      extractMut.mutate();
                  }}
                >
                  Extract lại
                </Button>
              </>
            )}
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="text-xs text-slate-500 hover:text-brand-600"
            >
              {showRaw ? "Ẩn" : "Xem"} nội dung RFP gốc
            </button>
          </div>

          {showRaw && (
            <pre className="mt-3 max-h-[300px] overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap">
              {rfp.rawContent || "(trống)"}
            </pre>
          )}

          {(extractMut.error || respondAllMut.error) && (
            <div className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {(extractMut.error as Error)?.message ??
                (respondAllMut.error as Error)?.message}
            </div>
          )}

          {respondAllMut.data && (
            <div className="mt-3 rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              Đã draft {respondAllMut.data.drafted} · bỏ qua {respondAllMut.data.skipped} · lỗi{" "}
              {respondAllMut.data.errors}.
            </div>
          )}
        </CardBody>
      </Card>

      {reqs.length === 0 && (
        <Card>
          <CardBody className="py-12 text-center text-sm text-slate-500">
            {rfp.rawContent?.trim()
              ? "Bấm 'AI extract yêu cầu' để bắt đầu."
              : "Cần dán nội dung RFP vào trước khi AI extract. Bấm 'Sửa' ở trên để thêm."}
          </CardBody>
        </Card>
      )}

      <div className="space-y-2">
        {reqs.map((r, idx) => (
          <RequirementRow
            key={r.id}
            idx={idx}
            req={r}
            expanded={expanded.has(r.id)}
            onToggle={() => toggle(r.id)}
            onDraft={() => respondOneMut.mutate(r.id)}
            drafting={respondOneMut.isPending && respondOneMut.variables === r.id}
            onSave={(patch) => editReqMut.mutate({ reqId: r.id, patch })}
            saving={editReqMut.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function HeaderEdit({
  rfp,
  onSave,
  onCancel,
  saving,
}: {
  rfp: RFPResponse;
  onSave: (body: Partial<RFPResponse>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    title: rfp.title,
    clientName: rfp.clientName ?? "",
    deadline: rfp.deadline ? rfp.deadline.slice(0, 10) : "",
    rawContent: rfp.rawContent,
    status: rfp.status,
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="t">Tiêu đề</Label>
          <Input
            id="t"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="c">Khách hàng</Label>
          <Input
            id="c"
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="d">Deadline</Label>
          <Input
            id="d"
            type="date"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="s">Status</Label>
          <select
            id="s"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={form.status}
            onChange={(e) =>
              setForm({
                ...form,
                status: e.target.value as "draft" | "in_progress" | "submitted",
              })
            }
          >
            <option value="draft">Nháp</option>
            <option value="in_progress">Đang làm</option>
            <option value="submitted">Đã gửi</option>
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="rc">Nội dung RFP</Label>
        <Textarea
          id="rc"
          rows={8}
          value={form.rawContent}
          onChange={(e) => setForm({ ...form, rawContent: e.target.value })}
          className="font-mono text-xs"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Hủy
        </Button>
        <Button
          size="sm"
          loading={saving}
          onClick={() =>
            onSave({
              title: form.title,
              clientName: form.clientName || null,
              deadline: form.deadline || null,
              rawContent: form.rawContent,
              status: form.status,
            } as Partial<RFPResponse>)
          }
        >
          <Save className="h-3.5 w-3.5" />
          Lưu
        </Button>
      </div>
    </div>
  );
}

function RequirementRow({
  idx,
  req,
  expanded,
  onToggle,
  onDraft,
  drafting,
  onSave,
  saving,
}: {
  idx: number;
  req: RFPRequirement;
  expanded: boolean;
  onToggle: () => void;
  onDraft: () => void;
  drafting: boolean;
  onSave: (patch: Partial<RFPRequirement>) => void;
  saving: boolean;
}) {
  const [editResponse, setEditResponse] = useState(false);
  const [responseDraft, setResponseDraft] = useState(req.response ?? "");

  const hasResponse = !!req.response && req.status !== "pending";

  return (
    <Card className={req.status === "approved" ? "border-emerald-300" : ""}>
      <CardBody className="py-3">
        <div className="flex items-start gap-3">
          <button
            onClick={onToggle}
            className="mt-0.5 text-slate-400 hover:text-slate-700 shrink-0"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[11px] font-mono text-slate-400">#{idx + 1}</span>
              <Badge className={CATEGORY_COLOR[req.category] ?? "bg-slate-100 text-slate-700"}>
                {CATEGORY_LABEL[req.category] ?? req.category}
              </Badge>
              <Badge className={PRIORITY_COLOR[req.priority]}>{req.priority}</Badge>
              {hasResponse && req.confidence && (
                <Badge className={CONFIDENCE_COLOR[req.confidence]}>
                  Conf: {req.confidence}
                </Badge>
              )}
              {req.status === "approved" && (
                <Badge className="bg-emerald-100 text-emerald-800">✓ Duyệt</Badge>
              )}
              {hasResponse && req.status !== "approved" && (
                <Badge className="bg-brand-100 text-brand-700">Drafted</Badge>
              )}
            </div>
            <div className="text-sm text-slate-800">{req.text}</div>
          </div>
          <div className="shrink-0 print:hidden">
            {!hasResponse ? (
              <Button size="sm" loading={drafting} onClick={onDraft}>
                <Sparkles className="h-3.5 w-3.5" />
                AI draft
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                loading={drafting}
                onClick={onDraft}
                title="Draft lại"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Lại
              </Button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pl-7 space-y-2">
            {hasResponse && !editResponse && (
              <div className="rounded-md bg-brand-50/40 border border-brand-100 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-brand-800">
                    <Sparkles className="h-3.5 w-3.5" />
                    Response draft
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setResponseDraft(req.response ?? "");
                        setEditResponse(true);
                      }}
                      className="text-xs text-slate-500 hover:text-brand-600"
                    >
                      <Pencil className="h-3 w-3 inline" /> Sửa
                    </button>
                    {req.status !== "approved" ? (
                      <button
                        onClick={() => onSave({ status: "approved" })}
                        className="text-xs text-emerald-600 hover:text-emerald-700"
                        title="Duyệt"
                      >
                        <CheckCircle2 className="h-3 w-3 inline" /> Duyệt
                      </button>
                    ) : (
                      <button
                        onClick={() => onSave({ status: "drafted" })}
                        className="text-xs text-slate-500 hover:text-amber-600"
                      >
                        <AlertCircle className="h-3 w-3 inline" /> Bỏ duyệt
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-sm text-slate-800 whitespace-pre-line">{req.response}</div>
              </div>
            )}

            {editResponse && (
              <div className="rounded-md bg-white border border-slate-200 p-3 space-y-2">
                <Textarea
                  rows={5}
                  value={responseDraft}
                  onChange={(e) => setResponseDraft(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditResponse(false)}>
                    Hủy
                  </Button>
                  <Button
                    size="sm"
                    loading={saving}
                    onClick={() => {
                      onSave({ response: responseDraft, status: "drafted" });
                      setEditResponse(false);
                    }}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Lưu
                  </Button>
                </div>
              </div>
            )}

            {!hasResponse && (
              <div className="text-xs text-slate-400 italic">
                Chưa có response. Bấm "AI draft" để tạo.
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "brand" | "emerald" | "amber";
}) {
  const toneMap: Record<string, string> = {
    brand: "text-brand-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
  };
  return (
    <div className="rounded-md border border-slate-200 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-xl font-semibold ${tone ? toneMap[tone] : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}
