import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";

export function AddActivityDialog({
  open,
  accountId,
  onClose,
  onCreated,
}: {
  open: boolean;
  accountId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState("note");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await api.post("/activities", {
        type,
        subject,
        content: content || null,
        accountId,
        completed: type !== "follow_up",
      });
      onCreated();
      onClose();
      setSubject("");
      setContent("");
      setType("note");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Ghi nhận activity</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">✕</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <Label>Loại</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="note">Ghi chú</option>
              <option value="call">Gọi điện</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="follow_up">Follow-up (cần làm)</option>
            </select>
          </div>
          <div>
            <Label>Tiêu đề *</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <Label>Nội dung</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
          </div>
          {err && <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={loading}>
              Lưu
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
