import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, Plus, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import type { Meeting, ActionItem } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { formatDate } from "@/lib/format";

export function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: meeting, isLoading } = useQuery({
    queryKey: ["meeting", id],
    queryFn: () => api.get<Meeting>(`/meetings/${id}`),
    enabled: !!id,
  });

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [newAction, setNewAction] = useState("");

  const processMut = useMutation({
    mutationFn: () => api.post(`/meetings/${id}/ai/process`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting", id] }),
  });

  const updateNotes = useMutation({
    mutationFn: (rawNotes: string) => api.put(`/meetings/${id}`, { rawNotes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meeting", id] });
      setEditingNotes(false);
    },
  });

  const toggleAction = useMutation({
    mutationFn: ({ actionId, status }: { actionId: string; status: ActionItem["status"] }) =>
      api.put(`/meetings/${id}/actions/${actionId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting", id] }),
  });

  const addAction = useMutation({
    mutationFn: (content: string) => api.post(`/meetings/${id}/actions`, { content }),
    onSuccess: () => {
      setNewAction("");
      qc.invalidateQueries({ queryKey: ["meeting", id] });
    },
  });

  const delAction = useMutation({
    mutationFn: (actionId: string) => api.del(`/meetings/${id}/actions/${actionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meeting", id] }),
  });

  if (isLoading || !meeting) return <div className="p-8 text-sm text-slate-500">Đang tải...</div>;

  const actions = meeting.actionItems ?? [];
  const pending = actions.filter((a) => a.status !== "done");
  const done = actions.filter((a) => a.status === "done");

  return (
    <div className="p-6 space-y-4">
      <Link to="/meetings" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-3.5 w-3.5" /> Meetings
      </Link>

      <Card>
        <CardBody>
          <h1 className="text-xl font-semibold">{meeting.title}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>📅 {formatDate(meeting.date)}</span>
            {meeting.attendees && <span>· 👥 {meeting.attendees}</span>}
          </div>
        </CardBody>
      </Card>

      <div>
        <Button
          variant="primary"
          size="sm"
          loading={processMut.isPending}
          onClick={() => processMut.mutate()}
          disabled={!meeting.rawNotes.trim()}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {meeting.aiSummary ? "Regenerate AI summary" : "AI xử lý ghi chú"}
        </Button>
        {processMut.error && (
          <div className="mt-2 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {(processMut.error as Error).message}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: AI summary + action items */}
        <div className="space-y-3">
          <Card>
            <CardBody>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-brand-600" />
                AI Summary
              </div>
              {meeting.aiSummary ? (
                <div className="prose-hsi text-slate-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{meeting.aiSummary}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-xs text-slate-400">
                  Chưa có summary. Bấm "AI xử lý ghi chú" ở trên.
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Action Items ({actions.length})</div>
              </div>
              <div className="space-y-1.5">
                {actions.length === 0 && (
                  <div className="text-xs text-slate-400">Chưa có action nào.</div>
                )}
                {pending.map((a) => (
                  <ActionRow
                    key={a.id}
                    action={a}
                    onToggle={(status) => toggleAction.mutate({ actionId: a.id, status })}
                    onDelete={() => delAction.mutate(a.id)}
                  />
                ))}
                {done.length > 0 && (
                  <div className="pt-2 mt-2 border-t border-slate-100">
                    <div className="mb-1 text-[10px] uppercase text-slate-400">Done ({done.length})</div>
                    {done.map((a) => (
                      <ActionRow
                        key={a.id}
                        action={a}
                        onToggle={(status) => toggleAction.mutate({ actionId: a.id, status })}
                        onDelete={() => delAction.mutate(a.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newAction.trim()) addAction.mutate(newAction.trim());
                }}
                className="mt-3 flex gap-2"
              >
                <Input
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  placeholder="Thêm action thủ công..."
                />
                <Button size="sm" type="submit" disabled={!newAction.trim()}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>

        {/* Right: raw notes */}
        <div>
          <Card>
            <CardBody>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">Raw Notes</div>
                {!editingNotes ? (
                  <button
                    onClick={() => {
                      setNotesDraft(meeting.rawNotes);
                      setEditingNotes(true);
                    }}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    Chỉnh sửa
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingNotes(false)}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={() => updateNotes.mutate(notesDraft)}
                      className="text-xs text-brand-600 hover:underline font-medium"
                    >
                      Lưu
                    </button>
                  </div>
                )}
              </div>
              {editingNotes ? (
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={20}
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans max-h-[600px] overflow-y-auto">
                  {meeting.rawNotes || (
                    <span className="text-slate-400 italic">
                      Chưa có ghi chú. Bấm "Chỉnh sửa" để thêm.
                    </span>
                  )}
                </pre>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ActionRow({
  action,
  onToggle,
  onDelete,
}: {
  action: ActionItem;
  onToggle: (status: ActionItem["status"]) => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-start gap-2 py-1.5 text-sm">
      <input
        type="checkbox"
        checked={action.status === "done"}
        onChange={() => onToggle(action.status === "done" ? "pending" : "done")}
        className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600"
      />
      <div className="flex-1 min-w-0">
        <div className={action.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}>
          {action.content}
        </div>
        <div className="flex gap-3 text-[11px] text-slate-500">
          {action.assignee && <span>👤 {action.assignee}</span>}
          {action.dueDate && <span>📅 {formatDate(action.dueDate)}</span>}
        </div>
      </div>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
