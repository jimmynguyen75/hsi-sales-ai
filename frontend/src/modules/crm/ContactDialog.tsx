/**
 * ContactDialog — create OR edit a contact.
 *
 * Passing `contact` switches to edit mode (PUT /api/contacts/:id). Without
 * it, we're in create mode (POST /api/contacts, which requires accountId).
 * One component handles both to keep the form fields + validation in sync.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Contact } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

interface Props {
  open: boolean;
  accountId: string;
  contact?: Contact | null; // null/undefined ⇒ create, truthy ⇒ edit
  onClose: () => void;
  onSaved: () => void;
}

export function ContactDialog({ open, accountId, contact, onClose, onSaved }: Props) {
  const editing = !!contact;
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-seed state whenever the dialog opens with a different contact.
  useEffect(() => {
    if (!open) return;
    setFullName(contact?.fullName ?? "");
    setTitle(contact?.title ?? "");
    setEmail(contact?.email ?? "");
    setPhone(contact?.phone ?? "");
    setIsPrimary(contact?.isPrimary ?? false);
    setErr(null);
  }, [open, contact]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const payload = {
        fullName: fullName.trim(),
        title: title || undefined,
        email: email || "",
        phone: phone || undefined,
        isPrimary,
      };
      if (editing && contact) {
        await api.put(`/contacts/${contact.id}`, payload);
      } else {
        await api.post("/contacts", { ...payload, accountId });
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
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">
            {editing ? "Sửa contact" : "Thêm contact mới"}
          </h2>
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
              required
              autoFocus
            />
          </div>
          <div>
            <Label>Chức danh</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: CTO, Head of IT..."
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@company.com"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            Primary contact
          </label>
          {err && (
            <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={loading} disabled={!fullName.trim()}>
              {editing ? "Lưu thay đổi" : "Tạo"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
