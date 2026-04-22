import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Account, Quotation } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export function NewQuotationDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const nav = useNavigate();
  const [form, setForm] = useState({
    title: "",
    accountId: "",
    validUntil: "",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: accounts } = useQuery({
    queryKey: ["accounts", "all"],
    queryFn: () => api.get<Account[]>("/accounts"),
    enabled: open,
  });

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const q = await api.post<Quotation>("/quotations", {
        title: form.title,
        accountId: form.accountId || null,
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
      });
      onCreated();
      onClose();
      nav(`/quotations/${q.id}`);
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
          <h2 className="text-sm font-semibold">Quotation mới</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <Label>Tiêu đề *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="VD: Core banking HCI cluster cho Vietcombank"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Account</Label>
              <select
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">—</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Hiệu lực đến</Label>
              <Input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              />
            </div>
          </div>
          {err && <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={loading}>
              Tạo & mở
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
