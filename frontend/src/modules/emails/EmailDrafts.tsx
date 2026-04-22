import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Trash2, Check, Mail, Send, X, CheckCircle2, AlertTriangle, Server, FlaskConical } from "lucide-react";
import { api } from "@/lib/api";
import type { EmailDraft, EmailSendResult, EmailStatus } from "@/lib/types";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { relativeTime } from "@/lib/format";
import { useToast } from "@/components/Toast";

const TYPE_LABEL: Record<string, string> = {
  cold_outreach: "Cold outreach",
  follow_up: "Follow-up",
  thank_you: "Thank you",
  introduction: "Introduction",
  proposal_send: "Gửi proposal",
  meeting_request: "Xin họp",
  check_in: "Check-in",
};

export function EmailDrafts() {
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<EmailSendResult | null>(null);

  const { data: drafts, isLoading } = useQuery({
    queryKey: ["email-drafts"],
    queryFn: () => api.get<EmailDraft[]>("/emails/drafts"),
  });

  const { data: status } = useQuery({
    queryKey: ["email-status"],
    queryFn: () => api.get<EmailStatus>("/emails/status"),
    staleTime: 60_000,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.del(`/emails/drafts/${id}`),
    onSuccess: () => {
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["email-drafts"] });
    },
  });

  const selectedDraft = (drafts ?? []).find((d) => d.id === selected);

  async function copyAll(d: EmailDraft) {
    await navigator.clipboard.writeText(`Subject: ${d.subject}\n\n${d.body}`);
    setCopied(d.id);
    setTimeout(() => setCopied(null), 1500);
  }

  if (isLoading) return <div className="py-8 text-sm text-slate-500">Đang tải...</div>;
  if (!drafts || drafts.length === 0) {
    return (
      <Card>
        <CardBody className="py-16 text-center text-sm text-slate-400">
          <Mail className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          Chưa có draft nào. Bấm "Soạn & lưu" ở tab "Soạn mới" để lưu email.
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {status && <SmtpStatusBanner mode={status.mode} />}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-2">
          {drafts.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d.id)}
              className={
                "w-full text-left rounded-lg border px-3 py-2 transition " +
                (selected === d.id
                  ? "border-brand-300 bg-brand-50/60"
                  : "border-slate-200 bg-white hover:border-slate-300")
              }
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <Badge className="bg-slate-100 text-slate-700">{TYPE_LABEL[d.type] ?? d.type}</Badge>
                <div className="flex items-center gap-1">
                  <StatusPill status={d.status} />
                  <span className="text-[10px] uppercase text-slate-400">{d.language}</span>
                </div>
              </div>
              <div className="text-sm font-medium text-slate-800 line-clamp-1">{d.subject}</div>
              <div className="text-xs text-slate-500 line-clamp-2">{d.body}</div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between gap-2">
                <span>{relativeTime(d.createdAt)}</span>
                {d.status === "sent" && d.sentTo && (
                  <span className="text-emerald-600 truncate">→ {d.sentTo}</span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div>
          {selectedDraft ? (
            <Card>
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge className="bg-brand-50 text-brand-700">
                        {TYPE_LABEL[selectedDraft.type] ?? selectedDraft.type}
                      </Badge>
                      <Badge className="bg-slate-100 text-slate-600">{selectedDraft.tone}</Badge>
                      <StatusPill status={selectedDraft.status} />
                      <span className="text-xs text-slate-500">
                        {relativeTime(selectedDraft.createdAt)}
                      </span>
                    </div>
                    <div className="text-base font-semibold">{selectedDraft.subject}</div>
                    {selectedDraft.status === "sent" && (
                      <div className="text-xs text-emerald-600 mt-0.5">
                        Đã gửi đến {selectedDraft.sentTo}
                        {selectedDraft.sentAt && ` • ${relativeTime(selectedDraft.sentAt)}`}
                      </div>
                    )}
                    {selectedDraft.status === "failed" && selectedDraft.sendError && (
                      <div className="text-xs text-rose-600 mt-0.5 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{selectedDraft.sendError}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                    <button
                      onClick={() => setSendDialogOpen(true)}
                      className="inline-flex items-center gap-1 text-xs text-white bg-brand-600 hover:bg-brand-700 rounded px-2 py-1"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Gửi email
                    </button>
                    <button
                      onClick={() => copyAll(selectedDraft)}
                      className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded px-2 py-1"
                    >
                      {copied === selectedDraft.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Xoá draft này?")) delMut.mutate(selectedDraft.id);
                      }}
                      className="inline-flex items-center gap-1 text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 rounded px-2 py-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Xoá
                    </button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans bg-slate-50 rounded p-3 max-h-[600px] overflow-y-auto">
                  {selectedDraft.body}
                </pre>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody className="py-16 text-center text-sm text-slate-400">
                Chọn draft để xem chi tiết.
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {sendDialogOpen && selectedDraft && (
        <SendEmailDialog
          draft={selectedDraft}
          mode={status?.mode ?? "preview"}
          onClose={() => setSendDialogOpen(false)}
          onSent={(result) => {
            setSendDialogOpen(false);
            qc.invalidateQueries({ queryKey: ["email-drafts"] });
            if (result.mode === "preview") {
              setPreviewResult(result);
              toast.info(
                "Email đã 'gửi' ở chế độ preview",
                "Chưa có SMTP thật — xem nội dung RFC822 ở popup.",
              );
            } else {
              toast.success(
                "Đã gửi email",
                `Tới ${result.accepted.join(", ")} • ${result.messageId}`,
              );
            }
          }}
          onError={(msg) => toast.error("Gửi thất bại", msg)}
        />
      )}

      {previewResult && (
        <PreviewModal result={previewResult} onClose={() => setPreviewResult(null)} />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: EmailDraft["status"] }) {
  if (status === "sent")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Đã gửi
      </span>
    );
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
        <AlertTriangle className="h-3 w-3" /> Lỗi
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
      Draft
    </span>
  );
}

function SmtpStatusBanner({ mode }: { mode: "smtp" | "preview" }) {
  if (mode === "smtp") {
    return (
      <div className="flex items-center gap-2 text-xs rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-1.5">
        <Server className="h-3.5 w-3.5" />
        SMTP đã cấu hình — email sẽ gửi thật đến người nhận.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-1.5">
      <FlaskConical className="h-3.5 w-3.5" />
      Chưa cấu hình SMTP — đang dùng preview mode. Email sẽ hiển thị nội dung RFC822 thay vì gửi thật.
    </div>
  );
}

function SendEmailDialog({
  draft,
  mode,
  onClose,
  onSent,
  onError,
}: {
  draft: EmailDraft;
  mode: "smtp" | "preview";
  onClose: () => void;
  onSent: (result: EmailSendResult) => void;
  onError: (msg: string) => void;
}) {
  const [to, setTo] = useState(draft.sentTo ?? "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [replyTo, setReplyTo] = useState("");

  const sendMut = useMutation({
    mutationFn: (payload: {
      to: string;
      cc?: string[];
      bcc?: string[];
      replyTo?: string;
    }) => api.post<EmailSendResult>(`/emails/drafts/${draft.id}/send`, payload),
    onSuccess: (result) => onSent(result),
    onError: (err: Error) => onError(err.message),
  });

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function splitEmails(s: string): string[] {
    return s
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim()) return;
    const ccList = splitEmails(cc);
    const bccList = splitEmails(bcc);
    sendMut.mutate({
      to: to.trim(),
      cc: ccList.length ? ccList : undefined,
      bcc: bccList.length ? bccList : undefined,
      replyTo: replyTo.trim() || undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-brand-600" />
              <h3 className="font-semibold text-slate-800">Gửi email</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:text-slate-700"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 py-3 space-y-3">
            {mode === "preview" && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Chế độ preview: email sẽ <strong>không</strong> gửi đến người nhận thật. Bạn sẽ xem
                được nội dung RFC822 đầy đủ.
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Đến <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="nguoi.nhan@example.com"
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">CC</label>
                <input
                  type="text"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="a@x.com, b@y.com"
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">BCC</label>
                <input
                  type="text"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="c@z.com"
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reply-To</label>
              <input
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="sales@hsi.com.vn (tuỳ chọn)"
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="text-xs text-slate-500 border-t border-slate-100 pt-2">
              <div>
                <span className="text-slate-400">Subject:</span>{" "}
                <span className="text-slate-700">{draft.subject}</span>
              </div>
              <div className="mt-1 text-slate-400">
                {draft.body.length} ký tự • {draft.language.toUpperCase()} • {draft.tone}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={sendMut.isPending || !to.trim()}
              className="text-sm px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <Send className="h-3.5 w-3.5" />
              {sendMut.isPending ? "Đang gửi..." : mode === "preview" ? "Gửi (preview)" : "Gửi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PreviewModal({
  result,
  onClose,
}: {
  result: EmailSendResult;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-600" />
            <h3 className="font-semibold text-slate-800">Preview RFC822 (dev mode)</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:text-slate-700"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-3 space-y-2 overflow-y-auto">
          <div className="text-xs text-slate-600">
            <span className="text-slate-400">Message-ID:</span> {result.messageId}
          </div>
          <div className="text-xs text-slate-600">
            <span className="text-slate-400">Accepted:</span> {result.accepted.join(", ")}
          </div>
          <pre className="text-[11px] font-mono bg-slate-50 border border-slate-200 rounded p-3 whitespace-pre-wrap break-all max-h-[60vh] overflow-y-auto">
            {result.preview ?? "(no preview)"}
          </pre>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 shrink-0">
          <button
            onClick={() => {
              if (result.preview) {
                void navigator.clipboard.writeText(result.preview);
              }
            }}
            className="text-sm px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy raw
          </button>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded bg-slate-800 text-white hover:bg-slate-900"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
