import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { Account, Meeting } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { useQuery } from "@tanstack/react-query";

export function NewMeetingDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const nav = useNavigate();
  const [form, setForm] = useState({
    title: "",
    date: new Date().toISOString().slice(0, 16),
    attendees: "",
    rawNotes: "",
    accountId: "",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: accounts } = useQuery({
    queryKey: ["accounts", "all"],
    queryFn: () => api.get<Account[]>("/accounts"),
    enabled: open,
  });

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const m = await api.post<Meeting>("/meetings", {
        title: form.title,
        date: new Date(form.date).toISOString(),
        attendees: form.attendees,
        rawNotes: form.rawNotes,
        accountId: form.accountId || null,
      });
      onCreated();
      onClose();
      nav(`/meetings/${m.id}`);
      setForm({
        title: "",
        date: new Date().toISOString().slice(0, 16),
        attendees: "",
        rawNotes: "",
        accountId: "",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Meeting mới</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <Label>Tiêu đề *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="VD: Kickoff với Vietcombank — Core banking refresh"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Thời gian *</Label>
              <Input
                type="datetime-local"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Liên kết Account</Label>
              <select
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
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
          </div>
          <div>
            <Label>Người tham dự</Label>
            <Input
              value={form.attendees}
              onChange={(e) => setForm({ ...form, attendees: e.target.value })}
              placeholder="Jimmy, Anh Nam (CTO), Chị Lan (IT)..."
            />
          </div>
          <div>
            <Label>Ghi chú / Transcript</Label>
            <Textarea
              value={form.rawNotes}
              onChange={(e) => setForm({ ...form, rawNotes: e.target.value })}
              rows={10}
              placeholder="Paste nội dung cuộc họp hoặc note nhanh trong lúc họp. AI sẽ tự tóm tắt và trích action items."
            />
          </div>
          {err && <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={loading}>
              Tạo & mở để AI xử lý
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
