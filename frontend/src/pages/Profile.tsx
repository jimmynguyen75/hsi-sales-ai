/**
 * Profile — user edits their own name / email / password.
 *
 * Uses PUT /api/auth/me, which is scoped to the bearer token's user id.
 * Role is read-only here; only an admin can change roles, and that lives
 * in /admin/users. Email changes are checked for uniqueness server-side.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserCog, Save, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/Toast";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import type { User } from "@/lib/types";

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const profileMut = useMutation({
    mutationFn: (body: { name?: string; email?: string }) =>
      api.put<User>("/auth/me", body),
    onSuccess: (u) => {
      updateUser(u);
      toast.success("Đã cập nhật thông tin");
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Cập nhật thất bại"),
  });

  const passwordMut = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.put<User>("/auth/me", body),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Đã đổi mật khẩu");
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Đổi mật khẩu thất bại"),
  });

  if (!user) {
    return <div className="p-8 text-sm text-slate-500">Đang tải...</div>;
  }

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const body: { name?: string; email?: string } = {};
    if (name !== user?.name) body.name = name;
    if (email !== user?.email) body.email = email;
    if (Object.keys(body).length === 0) {
      toast.info("Không có thay đổi để lưu");
      return;
    }
    profileMut.mutate(body);
  }

  function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!currentPassword) return setErr("Cần nhập mật khẩu hiện tại.");
    if (newPassword.length < 6) return setErr("Mật khẩu mới phải ≥ 6 ký tự.");
    if (newPassword !== confirmPassword) return setErr("Mật khẩu xác nhận không khớp.");
    passwordMut.mutate({ currentPassword, newPassword });
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <UserCog className="h-5 w-5" />
          Tài khoản của tôi
        </h1>
        <p className="text-sm text-slate-500">
          Cập nhật thông tin cá nhân và đổi mật khẩu. Vai trò chỉ admin mới đổi được.
        </p>
      </header>

      {/* Identity card — read-only badges so the user can see what role + ID
          they have without an admin trip. */}
      <Card>
        <CardBody className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-lg font-bold">
            {user.name?.charAt(0).toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{user.name}</div>
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Vai trò
            </div>
            <div
              className={`mt-0.5 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${
                user.role === "admin"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
            >
              {user.role === "admin" && <ShieldCheck className="h-3 w-3" />}
              {user.role}
            </div>
          </div>
        </CardBody>
      </Card>

      {err && (
        <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>
      )}

      {/* Profile form: name + email. Submit on its own so the password
          form below stays isolated (different validation rules). */}
      <Card>
        <CardBody>
          <form onSubmit={saveProfile} className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-500" />
              Thông tin cá nhân
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Họ tên</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  required
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@hpt.vn"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" loading={profileMut.isPending} size="sm">
                <Save className="h-3.5 w-3.5" />
                Lưu thay đổi
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Password form — separated so a name typo doesn't cost the user
          their password input, and vice versa. */}
      <Card>
        <CardBody>
          <form onSubmit={savePassword} className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-500" />
              Đổi mật khẩu
            </h2>
            <div>
              <Label>Mật khẩu hiện tại</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Mật khẩu mới</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="≥ 6 ký tự"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label>Xác nhận mật khẩu mới</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" loading={passwordMut.isPending} size="sm">
                <KeyRound className="h-3.5 w-3.5" />
                Cập nhật mật khẩu
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
