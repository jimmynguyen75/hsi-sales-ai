import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Swords, ExternalLink, FileSearch } from "lucide-react";
import { api } from "@/lib/api";
import type { Competitor } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/EmptyState";
import { relativeTime } from "@/lib/format";

const VENDORS = [
  "HPE",
  "Dell",
  "IBM",
  "Palo Alto",
  "CrowdStrike",
  "Microsoft",
  "Cisco",
  "Fortinet",
  "Lenovo",
  "Other",
];

export function CompetitorList() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: competitors, isLoading } = useQuery({
    queryKey: ["competitors"],
    queryFn: () => api.get<Competitor[]>("/competitors"),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Swords className="h-5 w-5 text-brand-600" />
            Competitor Intel Tracker
          </h1>
          <p className="text-sm text-slate-500">
            Theo dõi đối thủ, cập nhật intel (news, pricing, deals đấu) và AI viết SWOT.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Đối thủ mới
        </Button>
      </div>

      {!isLoading && (competitors?.length ?? 0) === 0 && (
        <EmptyState
          icon={Swords}
          title="Chưa theo dõi đối thủ nào"
          description="Track Cisco, Fortinet, Lenovo, NetApp... Mỗi đối thủ có thể thêm news / pricing / win-loss intel. AI sinh SWOT dựa trên dữ liệu bạn log."
          hints={[
            "Log intel ngay sau mỗi deal win/loss để AI phân tích chính xác",
            "Các deals đang mở có thể link tới competitor tương ứng",
            "SWOT AI sẽ tự update khi có đủ 5+ intel records",
          ]}
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Thêm đối thủ đầu tiên
            </Button>
          }
        />
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <Card>
            <CardBody className="text-sm text-slate-500">Đang tải...</CardBody>
          </Card>
        )}
        {(competitors ?? []).map((c) => (
          <Link key={c.id} to={`/competitors/${c.id}`}>
            <Card className="hover:border-brand-300 hover:shadow-md transition h-full">
              <CardBody>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-semibold text-sm text-slate-900">{c.name}</div>
                    {c.vendor && (
                      <Badge className="bg-slate-100 text-slate-700 mt-1">{c.vendor}</Badge>
                    )}
                  </div>
                  {c.swotAnalysis && (
                    <Badge className="bg-emerald-100 text-emerald-800">SWOT ✓</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                  <span className="inline-flex items-center gap-1">
                    <FileSearch className="h-3 w-3" />
                    {c._count?.intel ?? 0} intel
                  </span>
                  {c.website && (
                    <a
                      href={c.website}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 hover:text-brand-600"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Web
                    </a>
                  )}
                </div>
                {c.notes && <div className="text-xs text-slate-600 line-clamp-2">{c.notes}</div>}
                <div className="mt-2 text-[11px] text-slate-400">
                  Cập nhật {relativeTime(c.updatedAt)}
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      <NewCompetitorDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["competitors"] })}
      />
    </div>
  );
}

function NewCompetitorDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    vendor: "",
    website: "",
    notes: "",
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post<Competitor>("/competitors", body),
    onSuccess: () => {
      onCreated();
      onClose();
      setForm({ name: "", vendor: "", website: "", notes: "" });
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <h3 className="font-semibold">Thêm đối thủ</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <Label htmlFor="name">Tên đối thủ *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="VD: FPT IS, CMC TS, VNPT Technology..."
            />
          </div>
          <div>
            <Label htmlFor="vendor">Vendor chính</Label>
            <select
              id="vendor"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            >
              <option value="">— Chọn —</option>
              {VENDORS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Mô tả ngắn, vị thế, quan hệ..."
            />
          </div>
          {createMut.error && (
            <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {(createMut.error as Error).message}
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button
            loading={createMut.isPending}
            disabled={!form.name.trim()}
            onClick={() => createMut.mutate(form)}
          >
            Tạo
          </Button>
        </div>
      </div>
    </div>
  );
}
