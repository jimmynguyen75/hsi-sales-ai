import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Copy, Save, Mail, FileText, BookMarked, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { Account, Deal, Contact } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Label } from "@/components/ui/Input";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { EmailDrafts } from "./EmailDrafts";
import { EmailTemplates } from "./EmailTemplates";

type EmailType =
  | "cold_outreach"
  | "follow_up"
  | "thank_you"
  | "introduction"
  | "proposal_send"
  | "meeting_request"
  | "check_in";

type Tone = "professional" | "friendly" | "formal" | "urgent";
type Lang = "vi" | "en";

const TYPE_LABELS: { value: EmailType; label: string }[] = [
  { value: "cold_outreach", label: "Cold outreach" },
  { value: "follow_up", label: "Follow-up" },
  { value: "thank_you", label: "Thank you" },
  { value: "introduction", label: "Introduction" },
  { value: "proposal_send", label: "Gửi proposal" },
  { value: "meeting_request", label: "Xin họp" },
  { value: "check_in", label: "Check-in" },
];

const TONE_LABELS: { value: Tone; label: string }[] = [
  { value: "professional", label: "Chuyên nghiệp" },
  { value: "friendly", label: "Thân thiện" },
  { value: "formal", label: "Trang trọng" },
  { value: "urgent", label: "Khẩn" },
];

type Tab = "compose" | "drafts" | "templates";

export function EmailComposer() {
  const [tab, setTab] = useState<Tab>("compose");

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sales Email Composer</h1>
        <p className="text-sm text-slate-500">
          AI soạn email sales — cold outreach, follow-up, gửi proposal, xin họp...
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <TabBtn active={tab === "compose"} onClick={() => setTab("compose")} icon={<Sparkles className="h-3.5 w-3.5" />}>
          Soạn mới
        </TabBtn>
        <TabBtn active={tab === "drafts"} onClick={() => setTab("drafts")} icon={<FileText className="h-3.5 w-3.5" />}>
          Drafts
        </TabBtn>
        <TabBtn active={tab === "templates"} onClick={() => setTab("templates")} icon={<BookMarked className="h-3.5 w-3.5" />}>
          Templates
        </TabBtn>
      </div>

      {tab === "compose" && <ComposeForm />}
      {tab === "drafts" && <EmailDrafts />}
      {tab === "templates" && <EmailTemplates />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition",
        active
          ? "border-brand-600 text-brand-700 font-medium"
          : "border-transparent text-slate-500 hover:text-slate-900",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ComposeForm() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    type: "follow_up" as EmailType,
    language: "vi" as Lang,
    tone: "professional" as Tone,
    keyPoints: "",
    accountId: "",
    dealId: "",
    contactId: "",
  });
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | "both" | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const { data: accounts } = useQuery({
    queryKey: ["accounts", "all"],
    queryFn: () => api.get<Account[]>("/accounts"),
  });
  const { data: deals } = useQuery({
    queryKey: ["deals"],
    queryFn: () => api.get<Deal[]>("/deals"),
  });
  const { data: contacts } = useQuery({
    queryKey: ["contacts", form.accountId],
    queryFn: () => api.get<Contact[]>(`/contacts?accountId=${form.accountId}`),
    enabled: !!form.accountId,
  });

  const compose = useMutation({
    mutationFn: (saveDraft: boolean) =>
      api.post<{ subject: string; body: string; draftId: string | null }>("/emails/compose", {
        type: form.type,
        language: form.language,
        tone: form.tone,
        keyPoints: form.keyPoints,
        accountId: form.accountId || null,
        dealId: form.dealId || null,
        contactId: form.contactId || null,
        saveDraft,
      }),
    onSuccess: (data, saveDraft) => {
      setResult({ subject: data.subject, body: data.body });
      if (saveDraft && data.draftId) {
        setSavedId(data.draftId);
        qc.invalidateQueries({ queryKey: ["email-drafts"] });
      }
    },
  });

  async function copyText(text: string, which: "subject" | "body" | "both") {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardBody className="space-y-3">
          <div className="text-sm font-semibold">Thông tin email</div>

          <div>
            <Label>Loại email</Label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as EmailType })}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              {TYPE_LABELS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Ngôn ngữ</Label>
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value as Lang })}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <Label>Tông giọng</Label>
              <select
                value={form.tone}
                onChange={(e) => setForm({ ...form, tone: e.target.value as Tone })}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {TONE_LABELS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>Account (tuỳ chọn)</Label>
            <select
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value, contactId: "" })}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">—</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.companyName}
                </option>
              ))}
            </select>
          </div>

          {form.accountId && (
            <div>
              <Label>Liên hệ (tuỳ chọn)</Label>
              <select
                value={form.contactId}
                onChange={(e) => setForm({ ...form, contactId: e.target.value })}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">—</option>
                {(contacts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} {c.title ? `· ${c.title}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label>Deal (tuỳ chọn)</Label>
            <select
              value={form.dealId}
              onChange={(e) => setForm({ ...form, dealId: e.target.value })}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">—</option>
              {(deals ?? [])
                .filter((d) => !form.accountId || d.accountId === form.accountId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} · {d.stage}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <Label>Nội dung chính (key points)</Label>
            <Textarea
              value={form.keyPoints}
              onChange={(e) => setForm({ ...form, keyPoints: e.target.value })}
              rows={6}
              placeholder="VD: Cảm ơn buổi họp hôm qua, gửi kèm quotation HPE server cho 20 node, hẹn demo tuần sau."
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={compose.isPending}
              onClick={() => compose.mutate(false)}
              disabled={!form.keyPoints.trim()}
              className="flex-1"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI soạn
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={compose.isPending}
              onClick={() => compose.mutate(true)}
              disabled={!form.keyPoints.trim()}
            >
              <Save className="h-3.5 w-3.5" />
              Soạn & lưu
            </Button>
          </div>

          {compose.error && (
            <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {(compose.error as Error).message}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          {!result ? (
            <div className="flex flex-col items-center justify-center text-center py-16 text-sm text-slate-400">
              <Mail className="h-10 w-10 mb-3 text-slate-300" />
              <div>Điền key points bên trái và bấm "AI soạn" để tạo email.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-brand-50 text-brand-700">AI generated</Badge>
                  {savedId && <Badge className="bg-emerald-50 text-emerald-700">Đã lưu draft</Badge>}
                </div>
                <button
                  onClick={() =>
                    copyText(`Subject: ${result.subject}\n\n${result.body}`, "both")
                  }
                  className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  {copied === "both" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy tất cả
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Subject</Label>
                  <button
                    onClick={() => copyText(result.subject, "subject")}
                    className="text-[11px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
                  >
                    {copied === "subject" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </button>
                </div>
                <Input
                  value={result.subject}
                  onChange={(e) => setResult({ ...result, subject: e.target.value })}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Body</Label>
                  <button
                    onClick={() => copyText(result.body, "body")}
                    className="text-[11px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
                  >
                    {copied === "body" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </button>
                </div>
                <Textarea
                  value={result.body}
                  onChange={(e) => setResult({ ...result, body: e.target.value })}
                  rows={18}
                  className="font-sans"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setResult(null);
                    setSavedId(null);
                  }}
                >
                  Xoá kết quả
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={compose.isPending}
                  onClick={() => compose.mutate(true)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Soạn lại & lưu
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
