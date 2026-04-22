import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Account, Proposal } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";

const VENDORS = ["HPE", "Dell", "IBM", "Palo Alto", "CrowdStrike", "Microsoft"];

export function NewProposalDialog({
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
    language: "vi" as "vi" | "en",
    clientName: "",
    industry: "",
    requirements: "",
    valueProps: "",
    timeline: "",
    budget: "",
    vendors: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: accounts } = useQuery({
    queryKey: ["accounts", "all"],
    queryFn: () => api.get<Account[]>("/accounts"),
    enabled: open,
  });

  if (!open) return null;

  function toggleVendor(v: string) {
    setForm((f) => ({
      ...f,
      vendors: f.vendors.includes(v) ? f.vendors.filter((x) => x !== v) : [...f.vendors, v],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const p = await api.post<Proposal>("/proposals", {
        title: form.title,
        accountId: form.accountId || null,
        language: form.language,
        inputs: {
          clientName: form.clientName || undefined,
          industry: form.industry || undefined,
          requirements: form.requirements,
          valueProps: form.valueProps || undefined,
          timeline: form.timeline || undefined,
          budget: form.budget || undefined,
          vendors: form.vendors.length ? form.vendors : undefined,
        },
      });
      onCreated();
      onClose();
      nav(`/proposals/${p.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Proposal mới</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <Label>Tiêu đề proposal *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="VD: Đề xuất Core banking refresh cho Vietcombank"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Account (tuỳ chọn)</Label>
              <select
                value={form.accountId}
                onChange={(e) => {
                  const id = e.target.value;
                  const a = (accounts ?? []).find((x) => x.id === id);
                  setForm({
                    ...form,
                    accountId: id,
                    clientName: a?.companyName ?? form.clientName,
                    industry: a?.industry ?? form.industry,
                  });
                }}
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
              <Label>Ngôn ngữ</Label>
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value as "vi" | "en" })}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tên khách hàng</Label>
              <Input
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                placeholder="VD: Vietcombank"
              />
            </div>
            <div>
              <Label>Ngành</Label>
              <Input
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                placeholder="VD: Banking"
              />
            </div>
          </div>

          <div>
            <Label>Yêu cầu / Pain points *</Label>
            <Textarea
              value={form.requirements}
              onChange={(e) => setForm({ ...form, requirements: e.target.value })}
              rows={5}
              placeholder="VD: Nâng cấp hạ tầng core banking, 50+ node HCI, zero-downtime, tuân thủ SBV, DR site cách 30km..."
              required
            />
          </div>

          <div>
            <Label>Value props (tuỳ chọn)</Label>
            <Textarea
              value={form.valueProps}
              onChange={(e) => setForm({ ...form, valueProps: e.target.value })}
              rows={2}
              placeholder="TCO giảm 30%, deploy 8 tuần, 24x7 support..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Timeline</Label>
              <Input
                value={form.timeline}
                onChange={(e) => setForm({ ...form, timeline: e.target.value })}
                placeholder="VD: Q2/2026"
              />
            </div>
            <div>
              <Label>Ngân sách tham khảo</Label>
              <Input
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                placeholder="VD: 15-20 tỷ VND"
              />
            </div>
          </div>

          <div>
            <Label>Vendors ưu tiên</Label>
            <div className="flex flex-wrap gap-1.5">
              {VENDORS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleVendor(v)}
                  className={
                    "rounded-full border px-3 py-1 text-xs transition " +
                    (form.vendors.includes(v)
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400")
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {err && <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={loading}>
              Tạo & mở để AI soạn
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
