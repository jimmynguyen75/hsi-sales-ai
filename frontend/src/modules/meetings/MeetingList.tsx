import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Calendar, LayoutGrid } from "lucide-react";
import { api } from "@/lib/api";
import type { Meeting } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { formatDate, relativeTime } from "@/lib/format";
import { NewMeetingDialog } from "./NewMeetingDialog";

export function MeetingList() {
  const [open, setOpen] = useState(false);
  const { data: meetings, isLoading, refetch } = useQuery({
    queryKey: ["meetings"],
    queryFn: () => api.get<Meeting[]>("/meetings"),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Meeting Notes</h1>
          <p className="text-sm text-slate-500">
            Ghi chú cuộc họp — AI tự tạo minutes và action items.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/meetings/actions">
            <Button variant="outline" size="sm">
              <LayoutGrid className="h-3.5 w-3.5" />
              Action Board
            </Button>
          </Link>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Meeting mới
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && <Card><CardBody className="text-sm text-slate-500">Đang tải...</CardBody></Card>}
        {!isLoading && (meetings?.length ?? 0) === 0 && (
          <Card>
            <CardBody className="text-sm text-slate-500">
              Chưa có meeting nào. Bấm "Meeting mới" để tạo.
            </CardBody>
          </Card>
        )}
        {(meetings ?? []).map((m) => {
          const pending = (m.actionItems ?? []).filter((a) => a.status !== "done").length;
          return (
            <Link key={m.id} to={`/meetings/${m.id}`}>
              <Card className="hover:border-brand-300 hover:shadow-md transition">
                <CardBody>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-medium text-sm line-clamp-2">{m.title}</div>
                    {pending > 0 && (
                      <Badge className="bg-amber-100 text-amber-800 shrink-0">{pending} action</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formatDate(m.date)}</span>
                    <span>·</span>
                    <span>{relativeTime(m.createdAt)}</span>
                  </div>
                  {m.attendees && (
                    <div className="mt-2 text-xs text-slate-600 line-clamp-1">
                      👥 {m.attendees}
                    </div>
                  )}
                  {m.aiSummary && (
                    <div className="mt-2 text-xs text-slate-500 line-clamp-2 italic">
                      {m.aiSummary}
                    </div>
                  )}
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>

      <NewMeetingDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => refetch()}
      />
    </div>
  );
}
