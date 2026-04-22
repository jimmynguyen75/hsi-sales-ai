import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, Wand2, Save, Trash2, Printer, Check, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, downloadFile } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { Proposal, ProposalSection } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Input, Textarea, Label } from "@/components/ui/Input";

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  ready: "bg-blue-100 text-blue-700",
  sent: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-700",
};

export function ProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [refineId, setRefineId] = useState<string | null>(null);
  const [refineText, setRefineText] = useState("");
  const [downloading, setDownloading] = useState(false);

  const { data: p, isLoading } = useQuery({
    queryKey: ["proposal", id],
    queryFn: () => api.get<Proposal>(`/proposals/${id}`),
    enabled: !!id,
  });

  const generateMut = useMutation({
    mutationFn: () => api.post<Proposal>(`/proposals/${id}/generate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proposal", id] }),
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<Proposal>) => api.put<Proposal>(`/proposals/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proposal", id] }),
  });

  const refineMut = useMutation({
    mutationFn: ({ sectionId, instruction }: { sectionId: string; instruction: string }) =>
      api.post<Proposal>(`/proposals/${id}/refine-section`, { sectionId, instruction }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposal", id] });
      setRefineId(null);
      setRefineText("");
    },
  });

  const delMut = useMutation({
    mutationFn: () => api.del(`/proposals/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
      nav("/proposals");
    },
  });

  if (isLoading || !p) return <div className="p-8 text-sm text-slate-500">Đang tải...</div>;

  const sections = (p.sections ?? []).slice().sort((a, b) => a.order - b.order);

  function saveSection(sectionId: string) {
    if (!p) return;
    const updated = p.sections.map((s) =>
      s.id === sectionId ? { ...s, body: draftBody } : s,
    );
    updateMut.mutate({ sections: updated });
    setEditing(null);
  }

  function addSection() {
    if (!p) return;
    const newSec: ProposalSection = {
      id: Math.random().toString(36).slice(2, 10),
      heading: "New section",
      body: "",
      order: (sections[sections.length - 1]?.order ?? 0) + 1,
    };
    updateMut.mutate({ sections: [...p.sections, newSec] });
  }

  function deleteSection(sid: string) {
    if (!p) return;
    if (!confirm("Xoá section này?")) return;
    updateMut.mutate({ sections: p.sections.filter((s) => s.id !== sid) });
  }

  function updateHeading(sid: string, heading: string) {
    if (!p) return;
    updateMut.mutate({
      sections: p.sections.map((s) => (s.id === sid ? { ...s, heading } : s)),
    });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link
          to="/proposals"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Proposals
        </Link>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!p || sections.length === 0) return;
              setDownloading(true);
              try {
                await downloadFile(`/proposals/${p.id}/export.pdf`, `${p.title}.pdf`);
                toast.success("Đã tải PDF");
              } catch (err) {
                toast.error("Tải PDF thất bại", err instanceof Error ? err.message : String(err));
              } finally {
                setDownloading(false);
              }
            }}
            loading={downloading}
            disabled={sections.length === 0 || downloading}
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.print()}
            disabled={sections.length === 0}
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (confirm("Xoá proposal này?")) delMut.mutate();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <Input
                value={p.title}
                onChange={(e) => updateMut.mutate({ title: e.target.value })}
                className="text-lg font-semibold border-0 px-0 focus:ring-0 focus:border-0"
              />
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <Badge className={STATUS_COLOR[p.status] ?? "bg-slate-100 text-slate-700"}>
                  {p.status}
                </Badge>
                <span className="text-slate-500">v{p.version}</span>
                <span className="text-slate-500">· {p.language}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <select
                value={p.status}
                onChange={(e) =>
                  updateMut.mutate({ status: e.target.value as Proposal["status"] })
                }
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
              >
                <option value="draft">draft</option>
                <option value="ready">ready</option>
                <option value="sent">sent</option>
                <option value="accepted">accepted</option>
                <option value="rejected">rejected</option>
              </select>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="print:hidden">
        <Button
          variant="primary"
          size="sm"
          loading={generateMut.isPending}
          onClick={() => generateMut.mutate()}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {sections.length === 0 ? "AI soạn proposal" : "AI soạn lại (tăng version)"}
        </Button>
        {generateMut.error && (
          <div className="mt-2 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {(generateMut.error as Error).message}
          </div>
        )}
      </div>

      {sections.length === 0 && !generateMut.isPending ? (
        <Card>
          <CardBody className="py-16 text-center text-sm text-slate-400">
            Chưa có nội dung. Bấm "AI soạn proposal" để bắt đầu.
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {sections.map((s) => (
            <Card key={s.id} className="print:border-0 print:shadow-none print:break-inside-avoid">
              <CardBody>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <input
                    value={s.heading}
                    onChange={(e) => updateHeading(s.id, e.target.value)}
                    className="text-base font-semibold text-slate-900 bg-transparent border-0 focus:outline-none focus:ring-0 flex-1 min-w-0"
                  />
                  <div className="flex gap-1 print:hidden">
                    {editing === s.id ? (
                      <>
                        <button
                          onClick={() => saveSection(s.id)}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:bg-brand-50 border border-brand-200 rounded px-2 py-1"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Lưu
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="text-xs text-slate-500 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50"
                        >
                          Huỷ
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setDraftBody(s.body);
                            setEditing(s.id);
                          }}
                          className="text-xs text-slate-600 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50"
                        >
                          Chỉnh sửa
                        </button>
                        <button
                          onClick={() => setRefineId(s.id)}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 border border-brand-200 rounded px-2 py-1 hover:bg-brand-50"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          AI refine
                        </button>
                        <button
                          onClick={() => deleteSection(s.id)}
                          className="text-xs text-rose-600 border border-rose-200 rounded px-2 py-1 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editing === s.id ? (
                  <Textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={16}
                    className="font-sans"
                  />
                ) : (
                  <div className="prose-hsi text-slate-700">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.body}</ReactMarkdown>
                  </div>
                )}

                {refineId === s.id && (
                  <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 print:hidden">
                    <Label>Yêu cầu chỉnh sửa (AI sẽ rewrite)</Label>
                    <Textarea
                      value={refineText}
                      onChange={(e) => setRefineText(e.target.value)}
                      rows={3}
                      placeholder="VD: thêm chi tiết về HPE ProLiant Gen11, nhấn mạnh TCO 3 năm..."
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRefineId(null);
                          setRefineText("");
                        }}
                      >
                        Huỷ
                      </Button>
                      <Button
                        size="sm"
                        loading={refineMut.isPending}
                        disabled={!refineText.trim()}
                        onClick={() =>
                          refineMut.mutate({ sectionId: s.id, instruction: refineText })
                        }
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        Refine
                      </Button>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}

          <div className="print:hidden">
            <Button variant="outline" size="sm" onClick={addSection}>
              <Check className="h-3.5 w-3.5" />
              Thêm section
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
