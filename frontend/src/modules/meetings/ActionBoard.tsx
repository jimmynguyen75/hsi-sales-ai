import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { ActionItem } from "@/lib/types";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { formatDate } from "@/lib/format";

const COLUMNS: { key: ActionItem["status"]; label: string; color: string }[] = [
  { key: "pending", label: "Pending", color: "bg-slate-100 text-slate-700" },
  { key: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-700" },
  { key: "done", label: "Done", color: "bg-emerald-100 text-emerald-800" },
];

export function ActionBoard() {
  const qc = useQueryClient();

  const { data: actions, isLoading } = useQuery({
    queryKey: ["actions"],
    queryFn: () => api.get<(ActionItem & { meeting: { id: string; title: string; date: string } })[]>("/actions"),
  });

  const update = useMutation({
    mutationFn: ({ action, status }: { action: ActionItem; status: ActionItem["status"] }) =>
      api.put(`/meetings/${action.meetingId}/actions/${action.id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["actions"] }),
  });

  const grouped: Record<string, typeof actions> = {
    pending: (actions ?? []).filter((a) => a.status === "pending"),
    in_progress: (actions ?? []).filter((a) => a.status === "in_progress"),
    done: (actions ?? []).filter((a) => a.status === "done"),
  };

  return (
    <div className="p-6 space-y-4">
      <Link to="/meetings" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-3.5 w-3.5" /> Meetings
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Action Items Board</h1>
        <p className="text-sm text-slate-500">Tất cả action items trên mọi meeting.</p>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">Đang tải...</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map((col) => (
            <div key={col.key} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={col.color}>{col.label}</Badge>
                <span className="text-xs text-slate-500">({grouped[col.key]?.length ?? 0})</span>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {(grouped[col.key] ?? []).map((a) => (
                  <Card key={a.id} className="hover:shadow-sm">
                    <CardBody className="p-3">
                      <div className="text-sm text-slate-800">{a.content}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        {a.assignee && <span>👤 {a.assignee}</span>}
                        {a.dueDate && <span>📅 {formatDate(a.dueDate)}</span>}
                        <Link
                          to={`/meetings/${a.meeting.id}`}
                          className="text-brand-600 hover:underline"
                        >
                          {a.meeting.title}
                        </Link>
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        {COLUMNS.filter((c) => c.key !== a.status).map((c) => (
                          <button
                            key={c.key}
                            onClick={() => update.mutate({ action: a, status: c.key })}
                            className="rounded border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                          >
                            → {c.label}
                          </button>
                        ))}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
