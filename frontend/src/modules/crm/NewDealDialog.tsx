/**
 * NewDealDialog — create a deal attached to an account.
 *
 * Stage is the only enum field (matches backend Zod schema). value +
 * probability are optional. expectedClose takes a <input type="date"> value
 * ("YYYY-MM-DD") and we convert to ISO datetime before POSTing, because
 * the backend validator uses z.string().datetime().
 */
import { useState } from "react";
import { api } from "@/lib/api";
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

export function NewDealDialog({
  open,
  accountId,
  onClose,
  onCreated,
}: {
  open: boolean;
  accountId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState("prospecting");
  const [value, setValue] = useState<string>("");
  const [probability, setProbability] = useState<string>("");
  const [vendor, setVendor] = useState("");
  const [expectedClose, setExpectedClose] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setTitle("");
    setStage("prospecting");
    setValue("");
    setProbability("");
    setVendor("");
    setExpectedClose("");
    setErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      // HTML <input type="date"> → "YYYY-MM-DD". Backend expects ISO datetime,
      // so interpret as midnight UTC.
      const isoClose = expectedClose ? new Date(expectedClose).toISOString() : null;
      await api.post("/deals", {
        title: title.trim(),
        stage,
        value: value ? Number(value) : null,
        probability: probability ? Number(probability) : null,
        vendor: vendor || null,
        expectedClose: isoClose,
        accountId,
      });
      onCreated();
      onClose();
      reset();
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
          <h2 className="text-sm font-semibold">Tạo deal mới</h2>
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
          {err && (
            <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={loading} disabled={!title.trim()}>
              Lưu
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
