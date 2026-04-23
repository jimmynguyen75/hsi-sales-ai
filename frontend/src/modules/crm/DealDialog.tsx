/**
 * DealDialog — create OR edit a deal.
 *
 * Edit mode triggers PUT /api/deals/:id (RBAC: owner or admin). Create
 * mode POSTs to /api/deals with accountId.
 *
 * Date wrangling: backend uses ISO datetime, <input type="date"> uses
 * "YYYY-MM-DD". Convert both ways around the form.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Deal, User } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

const STAGES: Array<{ value: string; label: string }> = [
  { value: "prospecting", label: "Prospecting" },
  { value: "qualification", label: "Qualification" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "closed_won", label: "Closed — Won" },
  { value: "closed_lost", label: "Closed — Lost" },
];

const VENDORS = ["HPE", "Dell", "IBM", "Palo Alto", "CrowdStrike", "Microsoft", "Other"];

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  // ISO → YYYY-MM-DD
  return iso.slice(0, 10);
}

interface Props {
  open: boolean;
  accountId: string; // always known (deals always belong to an account)
  deal?: Deal | null;
  onClose: () => void;
  onSaved: () => void;
}

export function DealDialog({ open, accountId, deal, onClose, onSaved }: Props) {
  const { user: me } = useAuth();
  const editing = !!deal;
  // Owner reassignment is admin-only and only relevant in edit mode.
  const canReassign = me?.role === "admin" && editing;
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState("prospecting");
  const [value, setValue] = useState("");
  const [probability, setProbability] = useState("");
  const [vendor, setVendor] = useState("");
  const [expectedClose, setExpectedClose] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Team list for the Owner dropdown. `enabled: canReassign` avoids hitting
  // /users when the section isn't shown — sales don't have permission anyway.
  const { data: teamUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<User[]>("/users"),
    enabled: open && canReassign,
  });

  useEffect(() => {
    if (!open) return;
    setTitle(deal?.title ?? "");
    setStage(deal?.stage ?? "prospecting");
    setValue(deal?.value != null ? String(deal.value) : "");
    setProbability(deal?.probability != null ? String(deal.probability) : "");
    setVendor(deal?.vendor ?? "");
    setExpectedClose(toDateInput(deal?.expectedClose));
    setOwnerId(deal?.ownerId ?? "");
    setErr(null);
  }, [open, deal]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const isoClose = expectedClose ? new Date(expectedClose).toISOString() : null;
      const payload: Record<string, unknown> = {
        title: title.trim(),
        stage,
        value: value ? Number(value) : null,
        probability: probability ? Number(probability) : null,
        vendor: vendor || null,
        expectedClose: isoClose,
      };
      // Only include ownerId when it actually changed — avoids tripping the
      // backend reassign guard on every regular edit.
      if (canReassign && ownerId && ownerId !== deal?.ownerId) {
        payload.ownerId = ownerId;
      }
      if (editing && deal) {
        await api.put(`/deals/${deal.id}`, payload);
      } else {
        await api.post("/deals", { ...payload, accountId });
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
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">
            {editing ? "Sửa deal" : "Tạo deal mới"}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <Label>Tên deal *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Acme — DC Refresh 2026"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Stage *</Label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Vendor</Label>
              <select
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">— không chọn —</option>
                {VENDORS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Giá trị (VND)</Label>
              <Input
                type="number"
                min={0}
                step={1000000}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Probability (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                placeholder="0–100"
              />
            </div>
          </div>
          <div>
            <Label>Expected close</Label>
            <Input
              type="date"
              value={expectedClose}
              onChange={(e) => setExpectedClose(e.target.value)}
            />
          </div>
          {canReassign && (
            <div>
              <Label>Owner (sales phụ trách)</Label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {(teamUsers ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.email} {u.role === "admin" ? "(admin)" : ""}
                  </option>
                ))}
                {/* Fallback so the current owner is always selectable even
                    while the user list is loading or cached empty. */}
                {!teamUsers && deal?.owner && (
                  <option value={deal.owner.id}>{deal.owner.name}</option>
                )}
              </select>
              {ownerId !== deal?.ownerId && (
                <div className="mt-1 text-[11px] text-amber-600">
                  Deal sẽ được chuyển cho sales mới. Sales cũ sẽ không còn thấy deal này.
                </div>
              )}
            </div>
          )}
          {err && (
            <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={loading} disabled={!title.trim()}>
              {editing ? "Lưu thay đổi" : "Tạo"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
