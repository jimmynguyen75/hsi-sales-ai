/**
 * AccountDialog — create OR edit an account.
 *
 * Edit mode: PUT /api/accounts/:id (RBAC: owner or manager+).
 * Create mode: POST /api/accounts.
 *
 * Delete is not in this dialog — it's admin-only and wired into
 * AccountDetail's header.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Account } from "@/lib/types";
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
  const editing = !!account;
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    } else {
      setForm(EMPTY);
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
        await api.put(`/accounts/${account.id}`, form);
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
