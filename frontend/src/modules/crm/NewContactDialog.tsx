/**
 * NewContactDialog — create a contact attached to an account.
 *
 * Small form: fullName (required), title, email, phone, isPrimary.
 * Email field allows empty string — backend accepts literal("") so sales
 * can add a contact we only have a phone number for.
 */
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export function NewContactDialog({
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
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setFullName("");
    setTitle("");
    setEmail("");
    setPhone("");
    setIsPrimary(false);
    setErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await api.post("/contacts", {
        fullName: fullName.trim(),
        title: title.trim() || undefined,
        email: email.trim(),
        phone: phone.trim() || undefined,
        isPrimary,
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
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Thêm contact</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <Label>Họ tên *</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
              required
              autoFocus
            />
          </div>
          <div>
            <Label>Chức danh</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="IT Manager"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="a.nguyen@acme.vn"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+84 9xx xxx xxx"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 pt-1 select-none">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="rounded border-slate-300"
            />
            Đặt làm primary contact
          </label>
          {err && (
            <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={loading} disabled={!fullName.trim()}>
              Lưu
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
