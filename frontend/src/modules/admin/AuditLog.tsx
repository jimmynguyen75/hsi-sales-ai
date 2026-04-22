import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Filter, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { relativeTime } from "@/lib/format";

interface AuditEntry {
  id: string;
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditStats {
  total: number;
  byEntity: Record<string, number>;
  byAction: Record<string, number>;
}

const ACTION_COLOR: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700 border-emerald-200",
  update: "bg-sky-50 text-sky-700 border-sky-200",
  status_change: "bg-indigo-50 text-indigo-700 border-indigo-200",
  delete: "bg-rose-50 text-rose-700 border-rose-200",
  send: "bg-amber-50 text-amber-700 border-amber-200",
  export: "bg-slate-100 text-slate-700 border-slate-200",
};

const ENTITY_LABEL: Record<string, string> = {
  deal: "Deal",
  quotation: "Quotation",
  proposal: "Proposal",
  account: "Account",
  contact: "Contact",
  user: "User",
  product: "Product",
  email_draft: "Email",
};

export function AuditLog() {
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");

  const query = new URLSearchParams();
  if (action) query.set("action", action);
  if (entity) query.set("entity", entity);
  const queryString = query.toString();

  const { data: entries, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit-log", action, entity],
    queryFn: () => api.get<AuditEntry[]>(`/audit${queryString ? `?${queryString}` : ""}`),
  });

  const { data: stats } = useQuery({
    queryKey: ["audit-stats"],
    queryFn: () => api.get<AuditStats>("/audit/stats"),
    staleTime: 30_000,
  });

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Audit log
          </h1>
          <p className="text-sm text-slate-500">
            Lịch sử thay đổi trên các entity trọng yếu (deal / quotation / proposal / email).
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 text-sm text-slate-600 border border-slate-300 rounded px-2.5 py-1.5 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Làm mới
        </button>
      </header>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label="30 ngày qua" value={stats.total.toString()} />
          <StatCard
            label="Hoạt động nhiều nhất"
            value={topKey(stats.byEntity) ?? "—"}
            sub={topKey(stats.byEntity) ? `${stats.byEntity[topKey(stats.byEntity)!]} sự kiện` : ""}
          />
          <StatCard
            label="Xoá"
            value={(stats.byAction.delete ?? 0).toString()}
            sub="30 ngày qua"
          />
          <StatCard
            label="Gửi email"
            value={(stats.byAction.send ?? 0).toString()}
            sub="30 ngày qua"
          />
        </div>
      )}

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="text-sm border border-slate-300 rounded px-2 py-1"
            >
              <option value="">Mọi action</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="status_change">Status change</option>
              <option value="delete">Delete</option>
              <option value="send">Send</option>
              <option value="export">Export</option>
            </select>
            <select
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              className="text-sm border border-slate-300 rounded px-2 py-1"
            >
              <option value="">Mọi entity</option>
              <option value="deal">Deal</option>
              <option value="quotation">Quotation</option>
              <option value="proposal">Proposal</option>
              <option value="account">Account</option>
              <option value="email_draft">Email</option>
              <option value="user">User</option>
              <option value="product">Product</option>
            </select>
            {(action || entity) && (
              <button
                onClick={() => {
                  setAction("");
                  setEntity("");
                }}
                className="text-xs text-slate-500 underline"
              >
                Xoá filter
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="py-8 text-sm text-slate-500">Đang tải...</div>
          ) : !entries || entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Chưa có sự kiện nào khớp filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Thời gian</th>
                    <th className="py-2 pr-3 font-medium">Người thực hiện</th>
                    <th className="py-2 pr-3 font-medium">Action</th>
                    <th className="py-2 pr-3 font-medium">Entity</th>
                    <th className="py-2 font-medium">Diễn giải</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((e) => (
                    <tr key={e.id} className="align-top hover:bg-slate-50">
                      <td className="py-2 pr-3 text-xs text-slate-500 whitespace-nowrap">
                        <div>{relativeTime(e.createdAt)}</div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(e.createdAt).toLocaleString("vi-VN")}
                        </div>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <div className="text-slate-800">{e.userEmail}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{e.userRole}</div>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <span
                          className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                            ACTION_COLOR[e.action] ?? "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {e.action}
                        </span>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Badge className="bg-slate-100 text-slate-700">
                          {ENTITY_LABEL[e.entity] ?? e.entity}
                        </Badge>
                      </td>
                      <td className="py-2 text-slate-700">{e.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardBody className="py-3">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className="text-xl font-semibold mt-0.5 capitalize">{value}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
      </CardBody>
    </Card>
  );
}

function topKey(obj: Record<string, number>): string | null {
  const entries = Object.entries(obj);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}
