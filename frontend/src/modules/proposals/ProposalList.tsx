import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { Proposal } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { relativeTime } from "@/lib/format";
import { NewProposalDialog } from "./NewProposalDialog";

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  ready: "bg-blue-100 text-blue-700",
  sent: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-700",
};

export function ProposalList() {
  const [open, setOpen] = useState(false);
  const { data: proposals, isLoading, refetch } = useQuery({
    queryKey: ["proposals"],
    queryFn: () => api.get<Proposal[]>("/proposals"),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Proposal Generator</h1>
          <p className="text-sm text-slate-500">
            AI viết proposal IT infrastructure — HPE, Dell, IBM, Palo Alto, CrowdStrike, Microsoft.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Proposal mới
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <Card>
            <CardBody className="text-sm text-slate-500">Đang tải...</CardBody>
          </Card>
        )}
        {!isLoading && (proposals?.length ?? 0) === 0 && (
          <Card>
            <CardBody className="text-sm text-slate-500">
              Chưa có proposal nào. Bấm "Proposal mới" để tạo.
            </CardBody>
          </Card>
        )}
        {(proposals ?? []).map((p) => (
          <Link key={p.id} to={`/proposals/${p.id}`}>
            <Card className="hover:border-brand-300 hover:shadow-md transition">
              <CardBody>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="font-medium text-sm line-clamp-2">{p.title}</div>
                  <Badge className={STATUS_COLOR[p.status] ?? "bg-slate-100 text-slate-700"}>
                    {p.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{p.sections?.length ?? 0} sections</span>
                  <span>·</span>
                  <span>v{p.version}</span>
                  <span>·</span>
                  <span>{relativeTime(p.updatedAt)}</span>
                </div>
                {p.inputs?.requirements && (
                  <div className="mt-2 text-xs text-slate-600 line-clamp-2">
                    {p.inputs.requirements}
                  </div>
                )}
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      <NewProposalDialog open={open} onClose={() => setOpen(false)} onCreated={() => refetch()} />
    </div>
  );
}
