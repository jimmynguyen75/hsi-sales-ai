import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, BookMarked, Copy, Check } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Label } from "@/components/ui/Input";

interface EmailTemplate {
  id: string;
  name: string;
  type: string;
  language: string;
  subject: string;
  body: string;
}

const TYPES = [
  "cold_outreach",
  "follow_up",
  "thank_you",
  "introduction",
  "proposal_send",
  "meeting_request",
  "check_in",
];

export function EmailTemplates() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => api.get<EmailTemplate[]>("/emails/templates"),
  });

  const createMut = useMutation({
    mutationFn: (input: Omit<EmailTemplate, "id">) => api.post<EmailTemplate>("/emails/templates", input),
    onSuccess: () => {
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.del(`/emails/templates/${id}`),
    onSuccess: () => {
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });

  const selectedTpl = (templates ?? []).find((t) => t.id === selected);

  async function copyBody(t: EmailTemplate) {
    await navigator.clipboard.writeText(`Subject: ${t.subject}\n\n${t.body}`);
    setCopied(t.id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          Lưu sẵn email templates bạn dùng thường xuyên.
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          Template mới
        </Button>
      </div>

      {creating && <NewTemplateForm onCreate={(v) => createMut.mutate(v)} onCancel={() => setCreating(false)} loading={createMut.isPending} />}

      {isLoading ? (
        <div className="text-sm text-slate-500">Đang tải...</div>
      ) : !templates || templates.length === 0 ? (
        <Card>
          <CardBody className="py-16 text-center text-sm text-slate-400">
            <BookMarked className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            Chưa có template nào.
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={
                  "w-full text-left rounded-lg border px-3 py-2 transition " +
                  (selected === t.id
                    ? "border-brand-300 bg-brand-50/60"
                    : "border-slate-200 bg-white hover:border-slate-300")
                }
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-sm font-medium text-slate-800 line-clamp-1">{t.name}</div>
                  <span className="text-[10px] uppercase text-slate-400">{t.language}</span>
                </div>
                <Badge className="bg-slate-100 text-slate-700">{t.type}</Badge>
              </button>
            ))}
          </div>
          <div>
            {selectedTpl ? (
              <Card>
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-semibold">{selectedTpl.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className="bg-slate-100 text-slate-700">{selectedTpl.type}</Badge>
                        <span className="text-xs text-slate-500">{selectedTpl.language}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => copyBody(selectedTpl)}
                        className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded px-2 py-1"
                      >
                        {copied === selectedTpl.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        Copy
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Xoá template này?")) delMut.mutate(selectedTpl.id);
                        }}
                        className="inline-flex items-center gap-1 text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 rounded px-2 py-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Xoá
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label>Subject</Label>
                    <div className="text-sm text-slate-800 bg-slate-50 rounded px-3 py-2">
                      {selectedTpl.subject}
                    </div>
                  </div>
                  <div>
                    <Label>Body</Label>
                    <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans bg-slate-50 rounded p-3 max-h-[500px] overflow-y-auto">
                      {selectedTpl.body}
                    </pre>
                  </div>
                </CardBody>
              </Card>
            ) : (
              <Card>
                <CardBody className="py-16 text-center text-sm text-slate-400">
                  Chọn template để xem chi tiết.
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NewTemplateForm({
  onCreate,
  onCancel,
  loading,
}: {
  onCreate: (v: { name: string; type: string; language: string; subject: string; body: string }) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({
    name: "",
    type: "follow_up",
    language: "vi",
    subject: "",
    body: "",
  });

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="text-sm font-semibold">Template mới</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="md:col-span-1">
            <Label>Tên template</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="VD: Follow-up sau demo HPE"
            />
          </div>
          <div>
            <Label>Loại</Label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Ngôn ngữ</Label>
            <select
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        <div>
          <Label>Subject</Label>
          <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        </div>
        <div>
          <Label>Body</Label>
          <Textarea
            rows={10}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Dùng {contactName}, {accountName}, {dealTitle} nếu muốn merge sau..."
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Huỷ
          </Button>
          <Button
            size="sm"
            loading={loading}
            onClick={() => onCreate(form)}
            disabled={!form.name.trim() || !form.subject.trim() || !form.body.trim()}
          >
            Lưu template
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
