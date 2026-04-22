import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, FileSpreadsheet, Package } from "lucide-react";
import { api } from "@/lib/api";
import type { Quotation } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { formatDate, formatVND, relativeTime } from "@/lib/format";
import { NewQuotationDialog } from "./NewQuotationDialog";

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-700",
  expired: "bg-slate-200 text-slate-600",
};

export function QuotationList() {
  const [open, setOpen] = useState(false);
  const { data: quotations, isLoading, refetch } = useQuery({
    queryKey: ["quotations"],
    queryFn: () => api.get<Quotation[]>("/quotations"),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Quotation Builder</h1>
          <p className="text-sm text-slate-500">
            Tạo báo giá kỹ thuật với line items, AI gợi ý BOM từ requirements.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/quotations/catalog">
            <Button variant="outline" size="sm">
              <Package className="h-3.5 w-3.5" />
              Catalog
            </Button>
          </Link>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Quotation mới
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <Card>
            <CardBody className="text-sm text-slate-500">Đang tải...</CardBody>
          </Card>
        )}
        {!isLoading && (quotations?.length ?? 0) === 0 && (
          <Card>
            <CardBody className="text-sm text-slate-500">
              Chưa có quotation nào.
            </CardBody>
          </Card>
        )}
        {(quotations ?? []).map((q) => (
          <Link key={q.id} to={`/quotations/${q.id}`}>
            <Card className="hover:border-brand-300 hover:shadow-md transition">
              <CardBody>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-medium text-sm line-clamp-1">{q.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{q.number}</div>
                  </div>
                  <Badge className={STATUS_COLOR[q.status] ?? "bg-slate-100 text-slate-700"}>
                    {q.status}
                  </Badge>
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase text-slate-400">Total</div>
                    <div className="text-lg font-semibold text-slate-900">{formatVND(q.total)}</div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div className="flex items-center gap-1 justify-end">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      {q.items?.length ?? 0} items
                    </div>
                    <div className="mt-0.5">{relativeTime(q.updatedAt)}</div>
                  </div>
                </div>
                {q.validUntil && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    Hết hạn: {formatDate(q.validUntil)}
                  </div>
                )}
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      <NewQuotationDialog open={open} onClose={() => setOpen(false)} onCreated={() => refetch()} />
    </div>
  );
}
