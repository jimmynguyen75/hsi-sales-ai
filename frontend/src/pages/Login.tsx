import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";

/**
 * 3 tài khoản seed có sẵn để demo — cùng password `demo1234`.
 * Giữ ngay ở login page để tester không phải nhớ và dễ so sánh RBAC.
 */
const DEMO_ACCOUNTS: Array<{
  label: string;
  role: "sales" | "manager" | "admin";
  email: string;
  tone: "slate" | "amber" | "rose";
  hint: string;
}> = [
  {
    label: "Sales",
    role: "sales",
    email: "jimmy@hpt.vn",
    tone: "slate",
    hint: "Chỉ thấy account/deal của mình",
  },
  {
    label: "Manager",
    role: "manager",
    email: "manager@hpt.vn",
    tone: "amber",
    hint: "Thấy & quản lý cả team, sửa product",
  },
  {
    label: "Admin",
    role: "admin",
    email: "admin@hpt.vn",
    tone: "rose",
    hint: "Full quyền: xoá account, users, audit",
  },
];

const DEMO_PASSWORD = "demo1234";

const toneClasses: Record<string, string> = {
  slate: "border-slate-300 hover:bg-slate-50 text-slate-700",
  amber: "border-amber-300 hover:bg-amber-50 text-amber-800",
  rose: "border-rose-300 hover:bg-rose-50 text-rose-800",
};

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("jimmy@hpt.vn");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await doLogin(email, password);
  }

  async function doLogin(e: string, p: string) {
    setErr(null);
    setLoading(true);
    try {
      await login(e, p);
      nav("/crm");
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-lg bg-brand-600 text-white grid place-items-center text-lg font-bold">
            H
          </div>
          <h1 className="text-lg font-semibold">HSI Sales AI</h1>
          <p className="text-xs text-slate-500">HPT Vietnam — Internal tool</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Mật khẩu</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {err && <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}
          <Button type="submit" className="w-full" loading={loading}>
            Đăng nhập
          </Button>
        </form>

        {/* Quick-login — click để login nhanh bằng 3 role khác nhau. Thuận tiện
             khi test RBAC (ai sửa được gì, ai xoá được gì). */}
        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            Đăng nhập nhanh (demo)
          </div>
          <div className="space-y-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.role}
                type="button"
                disabled={loading}
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                  doLogin(a.email, DEMO_PASSWORD);
                }}
                className={`w-full rounded-md border px-3 py-2 text-left transition disabled:opacity-50 ${toneClasses[a.tone]}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{a.label}</span>
                  <span className="text-[10px] font-mono text-slate-500">{a.email}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{a.hint}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] text-slate-400">
            Password chung: <span className="font-mono">{DEMO_PASSWORD}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
