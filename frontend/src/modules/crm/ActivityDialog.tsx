/**
 * ActivityDialog — create OR edit an activity for an account.
 *
 * Edit mode: PUT /api/activities/:id. Create mode: POST /api/activities.
 *
 * We also expose the "completed" checkbox in edit mode so users can tick off
 * a follow-up without opening any separate screen.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Activity } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";

interface Props {
  open: boolean;
  accountId: string;
  activity?: Activity | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ActivityDialog({ open, accountId, activity, onClose, onSaved }: Props) {
  const editing = !!activity;
  const [type, setType] = useState("note");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [completed, setCompleted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType(activity?.type ?? "note");
    setSubject(activity?.subject ?? "");
    setContent(activity?.content ?? "");
    // In create mode: follow-ups default to not-completed; everything else completed.
    // In edit mode: respect whatever is on the entity.
    setCompleted(
      activity
        ? activity.completed
        : true, // note/call/email/meeting default completed
    );
    setErr(null);
  }, [open, activity]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const basePayload = {
        type,
        subject,
        content: content || null,
        // Only treat "follow_up" as work-to-do on CREATE if the user didn't
        // explicitly toggle. On EDIT we always send the current checkbox.
        completed: editing ? completed : type !== "follow_up",
      };
      if (editing && activity) {
        await api.put(`/activities/${activity.id}`, basePayload);
      } else {
        await api.post("/activities", { ...basePayload, accountId });
      }
      onSaved();
      onClose();
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
          <h2 className="text-sm font-semibold">
            {editing ? "Sửa activity" : "Ghi nhận activity"}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            ✕
          </button>
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
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <Label>Nội dung</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
          </div>
          {editing && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={completed}
                onChange={(e) => setCompleted(e.target.checked)}
              />
              Đã hoàn thành
            </label>
          )}
          {err && (
            <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={loading} disabled={!subject.trim()}>
              {editing ? "Lưu thay đổi" : "Lưu"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
