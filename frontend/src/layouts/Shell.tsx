import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  Users,
  Activity,
  Briefcase,
  FileText,
  FileSpreadsheet,
  FilePlus,
  Swords,
  BarChart3,
  Mail,
  BookOpen,
  Sun,
  LineChart,
  Trophy,
  LogOut,
  Menu,
  Bell,
  Target,
  Shield,
  ClipboardList,
  UserCog,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import { GlobalSearch } from "@/components/GlobalSearch";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Users;
  role?: "admin" | "manager"; // hide unless user has at least this role
}

interface NavGroup {
  title: string;
  items: NavItem[];
  role?: "admin" | "manager";
}

function roleMeets(user: string | undefined, req: "admin" | "manager"): boolean {
  if (!user) return false;
  if (req === "admin") return user === "admin";
  return user === "admin" || user === "manager";
}

const groups: NavGroup[] = [
  {
    title: "Khách hàng & Pipeline",
    items: [
      { to: "/crm", label: "Smart CRM", icon: Users },
      { to: "/pipeline", label: "Sales Pipeline", icon: Briefcase },
      { to: "/health-dashboard", label: "Account Health", icon: Activity },
      { to: "/meetings", label: "Meeting Notes", icon: FileText },
    ],
  },
  {
    title: "Đề xuất & Báo giá",
    items: [
      { to: "/proposals", label: "Proposals", icon: FilePlus },
      { to: "/quotations", label: "Quotations", icon: FileSpreadsheet },
      { to: "/rfp", label: "RFP Response", icon: FileText },
    ],
  },
  {
    title: "Thị trường & Đối thủ",
    items: [
      { to: "/competitors", label: "Competitor Intel", icon: Swords },
      { to: "/market", label: "Market Sizing", icon: Target },
    ],
  },
  {
    title: "Hỗ trợ hàng ngày",
    items: [
      { to: "/emails", label: "Email Composer", icon: Mail },
      { to: "/knowledge", label: "Knowledge Bot", icon: BookOpen },
      { to: "/briefing", label: "Daily Briefing", icon: Sun },
    ],
  },
  {
    title: "Báo cáo & Phân tích",
    items: [
      { to: "/reports", label: "Sales Reports", icon: LineChart },
      { to: "/win-loss", label: "Win/Loss", icon: Trophy },
    ],
  },
  {
    title: "Quản trị",
    role: "admin",
    items: [
      { to: "/admin/users", label: "Users", icon: UserCog, role: "admin" },
      { to: "/admin/audit", label: "Audit log", icon: ClipboardList, role: "admin" },
    ],
  },
];

export function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  function handleLogout() {
    logout();
    nav("/login");
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={cn(
          "z-30 flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform md:static md:translate-x-0",
          open ? "fixed translate-x-0" : "fixed -translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex h-14 items-center gap-2 px-5 border-b border-slate-200">
          <div className="h-8 w-8 rounded bg-brand-600 text-white grid place-items-center font-bold">
            H
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">HSI Sales AI</div>
            <div className="text-[10px] text-slate-500">HPT Vietnam</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-5">
          {groups
            .filter((g) => !g.role || roleMeets(user?.role, g.role))
            .map((g) => (
              <div key={g.title}>
                <div className="px-2 mb-1.5 text-[10px] font-semibold tracking-wider uppercase text-slate-500 flex items-center gap-1">
                  {g.role === "admin" && <Shield className="h-3 w-3" />}
                  {g.title}
                </div>
                <div className="space-y-0.5">
                  {g.items
                    .filter((item) => !item.role || roleMeets(user?.role, item.role))
                    .map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-100",
                            isActive && "bg-brand-50 text-brand-700 font-medium",
                          )
                        }
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    ))}
                </div>
              </div>
            ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-slate-50">
            <div className="h-8 w-8 shrink-0 rounded-full bg-slate-200 text-slate-700 grid place-items-center text-xs font-semibold">
              {user?.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="truncate text-[11px] text-slate-500 capitalize">{user?.role}</div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
              aria-label="Logout"
              title="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button
            className="md:hidden rounded p-1.5 hover:bg-slate-100"
            onClick={() => setOpen((v) => !v)}
          >
            <Menu className="h-4 w-4" />
          </button>
          <GlobalSearch />
          <button className="rounded p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto bg-slate-50">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
