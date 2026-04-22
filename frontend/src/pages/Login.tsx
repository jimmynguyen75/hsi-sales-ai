import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("jimmy@hpt.vn");
  const [password, setPassword] = useState("demo1234");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
      nav("/crm");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
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
          <p className="text-center text-[11px] text-slate-500 pt-2">
            Demo: jimmy@hpt.vn / demo1234
          </p>
        </form>
      </div>
    </div>
  );
}
