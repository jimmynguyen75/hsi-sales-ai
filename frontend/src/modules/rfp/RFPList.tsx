import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Plus, FileText, Clock, CheckCircle2, Trash2, Upload, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { RFPResponse, RFPSummary } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { formatDate, relativeTime } from "@/lib/format";

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-800",
  submitted: "bg-emerald-100 text-emerald-800",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  in_progress: "Đang làm",
  submitted: "Đã gửi",
};

export function RFPList() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: list, isLoading } = useQuery({
    queryKey: ["rfps"],
    queryFn: () => api.get<RFPSummary[]>("/rfp"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.del<{ deleted: boolean }>(`/rfp/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rfps"] }),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-600" />
            RFP Response Assistant
          </h1>
          <p className="text-sm text-slate-500">
            Dán RFP → AI extract yêu cầu → AI draft response cho từng item → xuất proposal.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          RFP mới
        </Button>
      </div>

      {!isLoading && (list?.length ?? 0) === 0 && (
        <EmptyState
          icon={FileText}
          title="Chưa có RFP nào"
          description="Paste nội dung RFP từ khách hàng → AI extract yêu cầu → AI draft response cho từng item. Tiết kiệm 80% thời gian chuẩn bị proposal đấu thầu."
          hints={[
            "Paste toàn bộ RFP (Word → copy text) vào ô nội dung",
            "AI tự extract ~15-40 yêu cầu, phân loại must / should / nice",
            "Draft tất cả response trong 1 click (AI chạy batch 8 items/lần)",
            "Edit thủ công từng response, mark approved, export thành proposal",
          ]}
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Tạo RFP đầu tiên
            </Button>
          }
        />
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <Card>
            <CardBody className="text-sm text-slate-500">Đang tải...</CardBody>
          </Card>
        )}
        {(list ?? []).map((r) => {
          const pct = r.totalRequirements
            ? Math.round((r.draftedResponses / r.totalRequirements) * 100)
            : 0;
          return (
            <Card key={r.id} className="hover:border-brand-300 hover:shadow-md transition">
              <CardBody>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Link
                    to={`/rfp/${r.id}`}
                    className="font-medium text-sm line-clamp-2 hover:text-brand-700"
                  >
                    {r.title}
                  </Link>
                  <Badge className={STATUS_COLOR[r.status]}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                </div>
                {r.clientName && (
                  <div className="text-xs text-slate-600 mb-1">{r.clientName}</div>
                )}
                <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                  {r.deadline && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Deadline {formatDate(r.deadline)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {r.draftedResponses}/{r.totalRequirements} responses
                  </span>
                </div>
                {r.totalRequirements > 0 && (
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
                    <div
                      className="h-full bg-brand-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-slate-400">
                    {relativeTime(r.updatedAt)}
                  </span>
                  <button
                    onClick={() => {
                      if (confirm(`Xóa "${r.title}"?`)) delMut.mutate(r.id);
                    }}
                    className="text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <NewRFPDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["rfps"] })}
      />
    </div>
  );
}

function NewRFPDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const nav = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMeta, setUploadMeta] = useState<{ filename: string; pageCount: number; characters: number } | null>(null);
  const [form, setForm] = useState({
    title: "",
    clientName: "",
    deadline: "",
    rawContent: "",
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post<RFPResponse>("/rfp", body),
    onSuccess: (r) => {
      onCreated();
      onClose();
      setForm({ title: "", clientName: "", deadline: "", rawContent: "" });
      setUploadMeta(null);
      nav(`/rfp/${r.id}`);
    },
  });

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-picking same file
    setUploading(true);
    setUploadMeta(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("hsi_token");
      const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";
      const resp = await fetch(`${API_URL}/rfp/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) {
        throw new Error(json.error ?? `Upload thất bại (${resp.status})`);
      }
      const { text, filename, pageCount, characters } = json.data as {
        text: string;
        filename: string;
        pageCount: number;
        characters: number;
      };
      setForm((f) => ({
        ...f,
        rawContent: text,
        title: f.title || filename.replace(/\.(pdf|docx)$/i, ""),
      }));
      setUploadMeta({ filename, pageCount, characters });
      toast.success(
        "Extract thành công",
        `${filename}: ${characters.toLocaleString("vi-VN")} ký tự${pageCount ? ` · ${pageCount} trang` : ""}`,
      );
    } catch (err) {
      toast.error("Extract thất bại", err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <h3 className="font-semibold">Tạo RFP mới</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="t">Tiêu đề *</Label>
              <Input
                id="t"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="RFP Bảo mật hệ thống BIDV 2026"
              />
            </div>
            <div>
              <Label htmlFor="c">Khách hàng</Label>
              <Input
                id="c"
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                placeholder="BIDV, Vietcombank..."
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
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="rc">Nội dung RFP</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={onPickFile}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  loading={uploading}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Upload PDF/DOCX
                </Button>
              </div>
            </div>
            {uploadMeta && (
              <div className="mb-2 rounded bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="font-medium truncate">{uploadMeta.filename}</span>
                <span className="text-emerald-600">·</span>
                <span>{uploadMeta.characters.toLocaleString("vi-VN")} ký tự</span>
                {uploadMeta.pageCount > 0 && (
                  <>
                    <span className="text-emerald-600">·</span>
                    <span>{uploadMeta.pageCount} trang</span>
                  </>
                )}
              </div>
            )}
            <Textarea
              id="rc"
              rows={10}
              value={form.rawContent}
              onChange={(e) => setForm({ ...form, rawContent: e.target.value })}
              placeholder="Dán text hoặc upload file PDF/DOCX. AI sẽ extract yêu cầu sau khi tạo."
              className="font-mono text-xs"
            />
          </div>
          {createMut.error && (
            <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {(createMut.error as Error).message}
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button
            loading={createMut.isPending}
            disabled={!form.title.trim()}
            onClick={() => createMut.mutate(form)}
          >
            Tạo
          </Button>
        </div>
      </div>
    </div>
  );
}
