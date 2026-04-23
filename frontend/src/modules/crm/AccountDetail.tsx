import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Sparkles,
  MessageCircle,
  Activity as ActivityIcon,
  Briefcase,
  Users,
  AlertTriangle,
  Lightbulb,
  UserPlus,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Account, Activity as ActivityT, Contact, Deal, HealthResult } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { formatVND, formatDate, relativeTime, healthColor, healthLabel, stageColor } from "@/lib/format";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AIChatSidebar } from "./AIChatSidebar";
import { ActivityDialog } from "./ActivityDialog";
import { ContactDialog } from "./ContactDialog";
import { DealDialog } from "./DealDialog";
import { AccountDialog } from "./AccountDialog";

type Tab = "timeline" | "contacts" | "deals" | "insights";

export function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("timeline");
  const [chatOpen, setChatOpen] = useState(false);

  // Dialog states — each can hold either `null` (closed / not editing) or an
  // entity (edit mode) or `{}` sentinel for "open in create mode".
  const [actDialog, setActDialog] = useState<{ open: boolean; editing: ActivityT | null }>({
    open: false,
    editing: null,
  });
  const [contactDialog, setContactDialog] = useState<{ open: boolean; editing: Contact | null }>({
    open: false,
    editing: null,
  });
  const [dealDialog, setDealDialog] = useState<{ open: boolean; editing: Deal | null }>({
    open: false,
    editing: null,
  });
  const [accountDialog, setAccountDialog] = useState(false);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiNextAction, setAiNextAction] = useState<string | null>(null);
  const [aiHealth, setAiHealth] = useState<HealthResult | null>(null);

  const { data: account, isLoading } = useQuery({
    queryKey: ["account", id],
    queryFn: () => api.get<Account>(`/accounts/${id}`),
    enabled: !!id,
  });

  const summaryMut = useMutation({
    mutationFn: () => api.post<{ summary: string }>(`/accounts/${id}/ai/summary`),
    onSuccess: (r) => setAiSummary(r.summary),
  });
  const nextActionMut = useMutation({
    mutationFn: () => api.post<{ suggestions: string }>(`/accounts/${id}/ai/next-action`),
    onSuccess: (r) => {
      setAiNextAction(r.suggestions);
      qc.invalidateQueries({ queryKey: ["account", id] });
    },
  });
  const healthMut = useMutation({
    mutationFn: () => api.post<HealthResult>(`/accounts/${id}/ai/health`),
    onSuccess: (r) => {
      setAiHealth(r);
      qc.invalidateQueries({ queryKey: ["account", id] });
    },
  });

  // --- Delete mutations ---
  const delContact = useMutation({
    mutationFn: (cid: string) => api.del(`/contacts/${cid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account", id] }),
  });
  const delDeal = useMutation({
    mutationFn: (did: string) => api.del(`/deals/${did}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account", id] });
      qc.invalidateQueries({ queryKey: ["deals"] });
    },
  });
  const delActivity = useMutation({
    mutationFn: (aid: string) => api.del(`/activities/${aid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account", id] }),
  });
  const delAccount = useMutation({
    mutationFn: () => api.del(`/accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      nav("/crm");
    },
  });

  if (isLoading || !account) {
    return <div className="p-8 text-sm text-slate-500">Đang tải...</div>;
  }

  const aiError = summaryMut.error || nextActionMut.error || healthMut.error;
  const canEditAccount = user?.role === "admin" || account.ownerId === user?.id;
  const canDeleteAccount = user?.role === "admin";
  const canDeleteDeal = user?.role === "admin";

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <Link to="/crm" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to accounts
        </Link>

        {/* Header */}
        <Card>
          <CardBody className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{account.companyName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                {account.industry && <Badge className="bg-slate-100 text-slate-700">{account.industry}</Badge>}
                {account.size && <Badge className="bg-slate-100 text-slate-700">{account.size}</Badge>}
                {/* Owner — handy for admin browsing other sales' accounts. */}
                {account.owner && (
                  <Badge
                    className="bg-brand-50 text-brand-700 border border-brand-200"
                    title={account.owner.email}
                  >
                    Owner: {account.owner.name}
                  </Badge>
                )}
                {account.website && (
                  <a
                    href={account.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 hover:underline"
                  >
                    {account.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
                {account.address && <span>· {account.address}</span>}
              </div>
              {account.notes && (
                <p className="mt-3 text-sm text-slate-700 max-w-2xl">{account.notes}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <HealthGauge score={account.healthScore} />
              <div className="flex gap-1.5">
                {canEditAccount && (
                  <Button variant="outline" size="sm" onClick={() => setAccountDialog(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Sửa
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setChatOpen((v) => !v)}>
                  <MessageCircle className="h-3.5 w-3.5" />
                  AI Chat
                </Button>
                {canDeleteAccount && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (
                        confirm(
                          `Xoá "${account.companyName}"? Hành động này sẽ xoá cả contacts, deals, activities thuộc account.`,
                        )
                      ) {
                        delAccount.mutate();
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    Xoá
                  </Button>
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* AI actions bar */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={summaryMut.isPending}
            onClick={() => summaryMut.mutate()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Tóm tắt account
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={nextActionMut.isPending}
            onClick={() => nextActionMut.mutate()}
          >
            <Lightbulb className="h-3.5 w-3.5" />
            Gợi ý next action
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={healthMut.isPending}
            onClick={() => healthMut.mutate()}
          >
            <ActivityIcon className="h-3.5 w-3.5" />
            Đánh giá health
          </Button>
        </div>

        {aiError && (
          <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {aiError instanceof Error ? aiError.message : "AI call failed"}
          </div>
        )}

        {/* AI result cards */}
        {aiSummary && (
          <AIResultCard title="AI Summary" onClose={() => setAiSummary(null)}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSummary}</ReactMarkdown>
          </AIResultCard>
        )}
        {aiNextAction && (
          <AIResultCard title="Next Actions" onClose={() => setAiNextAction(null)}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiNextAction}</ReactMarkdown>
          </AIResultCard>
        )}
        {aiHealth && (
          <AIResultCard title="Health Assessment" onClose={() => setAiHealth(null)}>
            <div className="mb-3 flex items-center gap-3">
              <HealthGauge score={aiHealth.score} />
              <Badge className={healthColor(aiHealth.score)}>{aiHealth.riskLevel}</Badge>
            </div>
            <p className="mb-3">{aiHealth.explanation}</p>
            <div className="space-y-1.5">
              {Object.entries(aiHealth.factors).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <div className="w-44 text-xs text-slate-600 capitalize">{k.replace(/_/g, " ")}</div>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-brand-500" style={{ width: `${v}%` }} />
                  </div>
                  <div className="w-10 text-right text-xs tabular-nums">{v}</div>
                </div>
              ))}
            </div>
          </AIResultCard>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200">
          <TabBtn active={tab === "timeline"} onClick={() => setTab("timeline")}>
            <ActivityIcon className="h-3.5 w-3.5" />
            Timeline ({account.activities?.length ?? 0})
          </TabBtn>
          <TabBtn active={tab === "contacts"} onClick={() => setTab("contacts")}>
            <Users className="h-3.5 w-3.5" />
            Contacts ({account.contacts?.length ?? 0})
          </TabBtn>
          <TabBtn active={tab === "deals"} onClick={() => setTab("deals")}>
            <Briefcase className="h-3.5 w-3.5" />
            Deals ({account.deals?.length ?? 0})
          </TabBtn>
          <TabBtn active={tab === "insights"} onClick={() => setTab("insights")}>
            <Lightbulb className="h-3.5 w-3.5" />
            AI Insights ({account.insights?.length ?? 0})
          </TabBtn>
        </div>

        {/* Tab content */}
        {tab === "timeline" && (
          <div className="space-y-2">
            <TabHeader
              icon={<ActivityIcon className="h-4 w-4 text-slate-400" />}
              title="Hoạt động"
              subtitle="Ghi chú, cuộc gọi, email, meeting, follow-up"
              action={
                <Button size="sm" onClick={() => setActDialog({ open: true, editing: null })}>
                  <Plus className="h-3.5 w-3.5" />
                  Ghi nhận activity
                </Button>
              }
            />
            {(account.activities ?? []).length === 0 && (
              <Card>
                <CardBody className="text-sm text-slate-500">Chưa có hoạt động nào.</CardBody>
              </Card>
            )}
            {(account.activities ?? []).map((a) => (
              <Card key={a.id}>
                <CardBody className="flex items-start gap-3 py-3">
                  <div
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      a.completed ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-slate-100 text-slate-700 capitalize">{a.type}</Badge>
                      <span className="font-medium text-sm">{a.subject}</span>
                      {a.dueDate && (
                        <span className="text-[11px] text-slate-500">
                          · due {formatDate(a.dueDate)}
                        </span>
                      )}
                    </div>
                    {a.content && (
                      <div className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{a.content}</div>
                    )}
                    <div className="mt-1 text-[11px] text-slate-400">{relativeTime(a.createdAt)}</div>
                  </div>
                  <RowActions
                    onEdit={() => setActDialog({ open: true, editing: a })}
                    onDelete={() => {
                      if (confirm(`Xoá activity "${a.subject}"?`)) delActivity.mutate(a.id);
                    }}
                  />
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {tab === "contacts" && (
          <div className="space-y-2">
            <TabHeader
              icon={<Users className="h-4 w-4 text-slate-400" />}
              title="Danh bạ"
              subtitle="Người liên hệ tại khách hàng"
              action={
                <Button
                  size="sm"
                  onClick={() => setContactDialog({ open: true, editing: null })}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Thêm contact
                </Button>
              }
            />
            <Card>
              <CardBody className="p-0">
                {(account.contacts ?? []).length === 0 ? (
                  <div className="p-5 text-sm text-slate-500">Chưa có contact nào.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                          Họ tên
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                          Chức danh
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                          Email
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                          Phone
                        </th>
                        <th className="w-24 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {(account.contacts ?? []).map((c) => (
                        <tr key={c.id} className="border-b border-slate-100">
                          <td className="px-4 py-2 font-medium">
                            {c.fullName}
                            {c.isPrimary && (
                              <Badge className="ml-2 bg-brand-100 text-brand-700">primary</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-600">{c.title ?? "—"}</td>
                          <td className="px-4 py-2 text-slate-600">{c.email ?? "—"}</td>
                          <td className="px-4 py-2 text-slate-600">{c.phone ?? "—"}</td>
                          <td className="px-2 py-2">
                            <RowActions
                              onEdit={() => setContactDialog({ open: true, editing: c })}
                              onDelete={() => {
                                if (confirm(`Xoá contact "${c.fullName}"?`)) delContact.mutate(c.id);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {tab === "deals" && (
          <div className="space-y-2">
            <TabHeader
              icon={<Briefcase className="h-4 w-4 text-slate-400" />}
              title="Cơ hội bán hàng"
              subtitle="Deal thuộc pipeline của account này"
              action={
                <Button size="sm" onClick={() => setDealDialog({ open: true, editing: null })}>
                  <Plus className="h-3.5 w-3.5" />
                  Tạo deal mới
                </Button>
              }
            />
            <div className="grid gap-3 md:grid-cols-2">
              {(account.deals ?? []).length === 0 && (
                <Card>
                  <CardBody className="text-sm text-slate-500">Chưa có deal nào.</CardBody>
                </Card>
              )}
              {(account.deals ?? []).map((d) => (
                <Card key={d.id}>
                  <CardBody>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm">{d.title}</div>
                      <Badge className={stageColor(d.stage)}>{d.stage}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div>
                        <div className="text-slate-400">Giá trị</div>
                        <div className="font-semibold text-slate-900">{formatVND(d.value)}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Probability</div>
                        <div className="font-semibold text-slate-900">{d.probability ?? "—"}%</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Vendor</div>
                        <div>{d.vendor ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Expected close</div>
                        <div>{formatDate(d.expectedClose)}</div>
                      </div>
                    </div>
                    <div className="mt-2 -mb-1 flex justify-end">
                      <RowActions
                        onEdit={() => setDealDialog({ open: true, editing: d })}
                        onDelete={
                          canDeleteDeal
                            ? () => {
                                if (confirm(`Xoá deal "${d.title}"?`)) delDeal.mutate(d.id);
                              }
                            : undefined
                        }
                      />
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>
        )}

        {tab === "insights" && (
          <div className="space-y-2">
            <TabHeader
              icon={<Sparkles className="h-4 w-4 text-slate-400" />}
              title="AI Insights"
              subtitle="Gợi ý & cảnh báo tạo bởi AI"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  loading={nextActionMut.isPending}
                  onClick={() => nextActionMut.mutate()}
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  Sinh insight mới
                </Button>
              }
            />
            {(account.insights ?? []).length === 0 && (
              <Card>
                <CardBody className="text-sm text-slate-500">
                  Chưa có insight nào. Bấm "Sinh insight mới" để AI generate.
                </CardBody>
              </Card>
            )}
            {(account.insights ?? []).map((i) => (
              <Card key={i.id}>
                <CardBody>
                  <div className="mb-2 flex items-center gap-2">
                    {i.type === "risk_alert" ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : (
                      <Lightbulb className="h-4 w-4 text-brand-500" />
                    )}
                    <Badge className="bg-slate-100 text-slate-700">{i.type}</Badge>
                    <Badge className="bg-amber-100 text-amber-800">{i.priority}</Badge>
                    <span className="text-[11px] text-slate-400 ml-auto">
                      {relativeTime(i.generatedAt)}
                    </span>
                  </div>
                  <div className="prose-hsi text-slate-700">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{i.content}</ReactMarkdown>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {chatOpen && (
        <AIChatSidebar
          accountId={account.id}
          accountName={account.companyName}
          onClose={() => setChatOpen(false)}
        />
      )}

      <ActivityDialog
        open={actDialog.open}
        accountId={account.id}
        activity={actDialog.editing}
        onClose={() => setActDialog({ open: false, editing: null })}
        onSaved={() => qc.invalidateQueries({ queryKey: ["account", id] })}
      />

      <ContactDialog
        open={contactDialog.open}
        accountId={account.id}
        contact={contactDialog.editing}
        onClose={() => setContactDialog({ open: false, editing: null })}
        onSaved={() => qc.invalidateQueries({ queryKey: ["account", id] })}
      />

      <DealDialog
        open={dealDialog.open}
        accountId={account.id}
        deal={dealDialog.editing}
        onClose={() => setDealDialog({ open: false, editing: null })}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["account", id] });
          qc.invalidateQueries({ queryKey: ["deals"] });
        }}
      />

      <AccountDialog
        open={accountDialog}
        account={account}
        onClose={() => setAccountDialog(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["account", id] });
          qc.invalidateQueries({ queryKey: ["accounts"] });
        }}
      />
    </div>
  );
}

/**
 * RowActions — inline pencil + trash icon buttons used on rows/cards.
 *
 * `onDelete` is optional — when omitted, we hide the delete icon (e.g. for
 * roles that aren't allowed to delete deals). Keeps the UI honest about what
 * the user can actually do rather than rendering a button that will 403.
 */
function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={onEdit}
        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        title="Sửa"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          title="Xoá"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * TabHeader — consistent header row used at the top of every tab content area.
 *
 * Left side: small muted icon + title (big) + subtitle (small, muted).
 * Right side: primary action (e.g. "Thêm contact", "Tạo deal mới").
 * Without this, per-tab add buttons feel like disconnected floating controls.
 */
function TabHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md bg-slate-100">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800 leading-tight">{title}</div>
          {subtitle && (
            <div className="text-[11px] text-slate-500 leading-tight truncate">{subtitle}</div>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px ${
        active
          ? "border-brand-600 text-brand-700 font-medium"
          : "border-transparent text-slate-600 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function HealthGauge({ score }: { score: number | null | undefined }) {
  const s = score ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-14 w-14">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke={s >= 75 ? "#10b981" : s >= 55 ? "#f59e0b" : s >= 35 ? "#f97316" : "#f43f5e"}
            strokeWidth="3"
            strokeDasharray={`${(s * 94.2) / 100}, 94.2`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-sm font-semibold">
          {score ?? "—"}
        </div>
      </div>
      <div>
        <div className="text-[11px] text-slate-500">Health</div>
        <div className="text-sm font-medium">{healthLabel(score)}</div>
      </div>
    </div>
  );
}

function AIResultCard({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-brand-200 bg-brand-50/40">
      <CardBody>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-600" />
            <span className="font-semibold text-sm">{title}</span>
          </div>
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-900">
            Đóng
          </button>
        </div>
        <div className="prose-hsi text-slate-800">{children}</div>
      </CardBody>
    </Card>
  );
}
