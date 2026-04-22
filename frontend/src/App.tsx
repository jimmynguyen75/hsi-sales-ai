import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Shell } from "@/layouts/Shell";
import { LoginPage } from "@/pages/Login";
import { ComingSoon } from "@/pages/ComingSoon";
import { AccountList } from "@/modules/crm/AccountList";
import { AccountDetail } from "@/modules/crm/AccountDetail";
import { MeetingList } from "@/modules/meetings/MeetingList";
import { MeetingDetail } from "@/modules/meetings/MeetingDetail";
import { ActionBoard } from "@/modules/meetings/ActionBoard";
import { EmailComposer } from "@/modules/emails/EmailComposer";
import { DailyBriefing } from "@/modules/briefing/DailyBriefing";
import { ProposalList } from "@/modules/proposals/ProposalList";
import { ProposalDetail } from "@/modules/proposals/ProposalDetail";
import { QuotationList } from "@/modules/quotations/QuotationList";
import { QuotationDetail } from "@/modules/quotations/QuotationDetail";
import { ProductCatalog } from "@/modules/quotations/ProductCatalog";
import { HealthDashboard } from "@/modules/health/HealthDashboard";
import { ReportList } from "@/modules/reports/ReportList";
import { ReportDetail } from "@/modules/reports/ReportDetail";
import { WinLossDashboard } from "@/modules/winloss/WinLossDashboard";
import { CompetitorList } from "@/modules/competitors/CompetitorList";
import { CompetitorDetail } from "@/modules/competitors/CompetitorDetail";
import { MarketSizing } from "@/modules/market/MarketSizing";
import { RFPList } from "@/modules/rfp/RFPList";
import { RFPDetail } from "@/modules/rfp/RFPDetail";
import { KnowledgeBot } from "@/modules/knowledge/KnowledgeBot";
import { AuditLog } from "@/modules/admin/AuditLog";
import { UserAdmin } from "@/modules/admin/UserAdmin";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Đang tải...
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/crm" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Protected>
              <Shell />
            </Protected>
          }
        >
          <Route index element={<Navigate to="/crm" replace />} />
          <Route path="crm" element={<AccountList />} />
          <Route path="crm/:id" element={<AccountDetail />} />
          <Route path="health-dashboard" element={<HealthDashboard />} />
          <Route path="meetings" element={<MeetingList />} />
          <Route path="meetings/actions" element={<ActionBoard />} />
          <Route path="meetings/:id" element={<MeetingDetail />} />
          <Route path="proposals" element={<ProposalList />} />
          <Route path="proposals/:id" element={<ProposalDetail />} />
          <Route path="quotations" element={<QuotationList />} />
          <Route path="quotations/catalog" element={<ProductCatalog />} />
          <Route path="quotations/:id" element={<QuotationDetail />} />
          <Route path="rfp" element={<RFPList />} />
          <Route path="rfp/:id" element={<RFPDetail />} />
          <Route path="competitors" element={<CompetitorList />} />
          <Route path="competitors/:id" element={<CompetitorDetail />} />
          <Route path="market" element={<MarketSizing />} />
          <Route path="emails" element={<EmailComposer />} />
          <Route path="knowledge" element={<KnowledgeBot />} />
          <Route path="briefing" element={<DailyBriefing />} />
          <Route path="reports" element={<ReportList />} />
          <Route path="reports/:id" element={<ReportDetail />} />
          <Route path="win-loss" element={<WinLossDashboard />} />
          <Route
            path="admin/audit"
            element={
              <AdminOnly>
                <AuditLog />
              </AdminOnly>
            }
          />
          <Route
            path="admin/users"
            element={
              <AdminOnly>
                <UserAdmin />
              </AdminOnly>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
