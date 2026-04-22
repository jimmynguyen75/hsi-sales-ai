import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCog, UserPlus, Trash2, Shield, X } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardBody, Badge } from "@/components/ui/Card";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/hooks/useAuth";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "sales" | "manager" | "admin";
  createdAt: string;
  _count: { accounts: number; deals: number };
}

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-rose-50 text-rose-700 border-rose-200",
  manager: "bg-indigo-50 text-indigo-700 border-indigo-200",
  sales: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function UserAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user: me } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<AdminUser[]>("/users"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.del(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Đã xoá user");
    },
    onError: (e: Error) => toast.error("Xoá thất bại", e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            User management
          </h1>
          <p className="text-sm text-slate-500">
            Chỉ admin xem được trang này. Tạo / sửa / phân quyền tài khoản.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingUser(null);
            setDialogOpen(true);
          }}
          className="inline-flex items-center gap-1 text-sm text-white bg-brand-600 hover:bg-brand-700 rounded px-3 py-1.5"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Thêm user
        </button>
      </header>

      <Card>
        <CardBody>
          {isLoading ? (
            <div className="py-8 text-sm text-slate-500">Đang tải...</div>
          ) : !users || users.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">Chưa có user.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2 pr-3 font-medium">Họ tên</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Vai trò</th>
                  <th className="py-2 pr-3 font-medium">Accounts</th>
                  <th className="py-2 pr-3 font-medium">Deals</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-3">{u.name}</td>
                    <td className="py-2 pr-3 text-slate-600">{u.email}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border ${
                          ROLE_COLOR[u.role] ?? ""
                        }`}
                      >
                        {u.role === "admin" && <Shield className="h-3 w-3" />}
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{u._count.accounts}</td>
                    <td className="py-2 pr-3 text-slate-600">{u._count.deals}</td>
                    <td className="py-2 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setEditingUser(u);
                            setDialogOpen(true);
                          }}
                          className="text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded px-2 py-1"
                        >
                          Sửa
                        </button>
                        <button
                          disabled={u.id === me?.id}
                          onClick={() => {
                            if (confirm(`Xoá user ${u.email}?`)) delMut.mutate(u.id);
                          }}
                          className="text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 rounded px-2 py-1 disabled:opacity-30 inline-flex items-center gap-1"
                          title={u.id === me?.id ? "Không thể xoá chính mình" : "Xoá"}
                        >
                          <Trash2 className="h-3 w-3" />
                          Xoá
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {dialogOpen && (
        <UserDialog
          user={editingUser}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            qc.invalidateQueries({ queryKey: ["admin-users"] });
          }}
        />
      )}
    </div>
  );
}

function UserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = user !== null;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<"sales" | "manager" | "admin">(user?.role ?? "sales");
  const [password, setPassword] = useState("");

  const saveMut = useMutation({
    mutationFn: () => {
      if (isEdit) {
        const body: Record<string, unknown> = { name, role };
        if (password) body.password = password;
        return api.put(`/users/${user.id}`, body);
      }
      return api.post("/users", { name, email, role, password });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Đã cập nhật user" : "Đã tạo user mới");
      onSaved();
    },
    onError: (e: Error) => toast.error("Thất bại", e.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate();
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="font-semibold">{isEdit ? "Sửa user" : "Thêm user"}</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-4 py-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Họ tên *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
              <input
                type="email"
                required
                disabled={isEdit}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-100"
              />
              {isEdit && (
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Email không đổi được sau khi tạo.
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Vai trò *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
              >
                <option value="sales">Sales</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isEdit ? "Đổi mật khẩu (để trống nếu không đổi)" : "Mật khẩu *"}
              </label>
              <input
                type="password"
                minLength={6}
                required={!isEdit}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? "(giữ nguyên)" : "tối thiểu 6 ký tự"}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded border border-slate-300 text-slate-700"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={saveMut.isPending}
              className="text-sm px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saveMut.isPending ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
