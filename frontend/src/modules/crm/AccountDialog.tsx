/**
 * AccountDialog — create OR edit an account.
 *
 * Edit mode: PUT /api/accounts/:id (RBAC: owner or admin).
 * Create mode: POST /api/accounts.
 *
 * Delete is not in this dialog — it's admin-only and wired into
 * AccountDetail's header.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Account, User } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";

interface Props {
  open: boolean;
  account?: Account | null;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY = {
  companyName: "",
  industry: "",
  size: "",
  website: "",
  address: "",
  notes: "",
};

export function AccountDialog({ open, account, onClose, onSaved }: Props) {
  const { user: me } = useAuth();
  const editing = !!account;
  const canReassign = me?.role === "admin" && editing;
  const [form, setForm] = useState(EMPTY);
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: teamUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<User[]>("/users"),
    enabled: open && canReassign,
  });

  useEffect(() => {
    if (!open) return;
    if (account) {
      setForm({
        companyName: account.companyName ?? "",
        industry: account.industry ?? "",
        size: account.size ?? "",
        website: account.website ?? "",
        address: account.address ?? "",
        notes: account.notes ?? "",
      });
      setOwnerId(account.ownerId ?? "");
    } else {
      setForm(EMPTY);
      setOwnerId("");
    }
    setErr(null);
  }, [open, account]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (editing && account) {
        // Send ownerId only when admin changed it — skips the backend
        // reassign guard on plain edits (same-value reassign is a no-op).
        const payload: Record<string, unknown> = { ...form };
        if (canReassign && ownerId && ownerId !== account.ownerId) {
          payload.ownerId = ownerId;
        }
        await api.put(`/accounts/${account.id}`, payload);
      } else {
        await api.post("/accounts", form);
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
            {editing ? "Sửa account" : "Thêm account mới"}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <Label>Tên công ty *</Label>
            <Input
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Industry</Label>
              <Input
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                placeholder="Banking, Manufacturing..."
              />
            </div>
            <div>
              <Label>Size</Label>
              <select
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Chọn size</option>
                <option value="SMB">SMB</option>
                <option value="mid-market">Mid-market</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Website</Label>
            <Input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label>Địa chỉ</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <Label>Ghi chú</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
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
                {!teamUsers && account?.owner && (
                  <option value={account.owner.id}>{account.owner.name}</option>
                )}
              </select>
              {ownerId !== account?.ownerId && (
                <div className="mt-1 text-[11px] text-amber-600">
                  Account (cùng contacts / deals / activities) sẽ được chuyển cho sales mới.
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
            <Button type="submit" loading={loading} disabled={!form.companyName.trim()}>
              {editing ? "Lưu thay đổi" : "Tạo"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
