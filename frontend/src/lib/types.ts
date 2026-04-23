export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface Account {
  id: string;
  companyName: string;
  industry: string | null;
  size: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
  healthScore: number | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  _count?: { deals: number; contacts: number; activities: number };
  activities?: Activity[];
  contacts?: Contact[];
  deals?: Deal[];
  insights?: CRMInsight[];
  owner?: User;
}

export interface Contact {
  id: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  accountId: string;
}

export interface Deal {
  id: string;
  title: string;
  value: number | null;
  stage: string;
  probability: number | null;
  expectedClose: string | null;
  vendor: string | null;
  productLine: string | null;
  accountId: string;
  ownerId?: string;
  createdAt: string;
  updatedAt: string;
  account?: Pick<Account, "id" | "companyName" | "industry">;
  owner?: Pick<User, "id" | "name" | "email">;
}

export interface Activity {
  id: string;
  type: string;
  subject: string;
  content: string | null;
  dueDate: string | null;
  completed: boolean;
  accountId: string | null;
  dealId: string | null;
  createdAt: string;
}

export interface CRMInsight {
  id: string;
  accountId: string;
  type: string;
  content: string;
  priority: string;
  status: string;
  generatedAt: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  attendees: string;
  rawNotes: string;
  aiSummary: string | null;
  accountId: string | null;
  dealId: string | null;
  createdAt: string;
  actionItems?: ActionItem[];
}

export interface ActionItem {
  id: string;
  content: string;
  assignee: string | null;
  dueDate: string | null;
  status: "pending" | "in_progress" | "done";
  meetingId: string;
  meeting?: { id: string; title: string; date: string };
}

export interface EmailDraft {
  id: string;
  type: string;
  language: string;
  subject: string;
  body: string;
  tone: string;
  status: "draft" | "sent" | "failed";
  sentAt: string | null;
  sentTo: string | null;
  sendError: string | null;
  accountId: string | null;
  dealId: string | null;
  contactId: string | null;
  createdAt: string;
}

export interface EmailSendResult {
  draft: EmailDraft;
  mode: "smtp" | "preview";
  messageId: string;
  accepted: string[];
  preview: string | null;
}

export interface EmailStatus {
  mode: "smtp" | "preview";
}

export interface DailyBriefing {
  id: string;
  date: string;
  userId: string;
  content: string;
  sections: {
    followUps: Array<{ id: string; subject: string; dueDate: string | null; accountName?: string }>;
    meetings: Array<{ id: string; title: string; date: string; accountName?: string }>;
    expiringDeals: Array<{
      id: string;
      title: string;
      expectedClose: string | null;
      accountName?: string;
      value: number | null;
    }>;
    pipelineSnapshot: {
      totalValue: number;
      byStage: Record<string, { count: number; value: number }>;
    };
    recentActivity: Array<{ id: string; subject: string; type: string; createdAt: string }>;
  };
  isRead: boolean;
  createdAt: string;
}

export interface HealthResult {
  score: number;
  riskLevel: "healthy" | "watch" | "at_risk" | "critical";
  factors: {
    engagement_recency: number;
    deal_velocity: number;
    revenue_trend: number;
    response_rate: number;
    support_issues: number;
  };
  explanation: string;
}

export interface HealthFactors {
  engagement_recency: number;
  deal_velocity: number;
  revenue_trend: number;
  response_rate: number;
  support_issues: number;
}

export interface HealthDashboardRow {
  id: string;
  companyName: string;
  industry: string | null;
  size: string | null;
  healthScore: number | null;
  riskLevel: "healthy" | "watch" | "at_risk" | "critical" | null;
  explanation: string | null;
  factors: HealthFactors | null;
  lastAssessedAt: string | null;
  dealsCount: number;
  activitiesCount: number;
}

export interface HealthDashboard {
  buckets: {
    healthy: number;
    watch: number;
    at_risk: number;
    critical: number;
    unassessed: number;
  };
  rows: HealthDashboardRow[];
}

export interface HealthSnapshot {
  id: string;
  accountId: string;
  score: number;
  riskLevel: string;
  factors: HealthFactors;
  explanation: string;
  createdAt: string;
}

export interface SalesReport {
  id: string;
  userId: string;
  title: string;
  period: "week" | "month" | "quarter" | "custom";
  startDate: string;
  endDate: string;
  content: string;
  sections: ReportSections;
  createdAt: string;
}

export interface ReportSections {
  period: { start: string; end: string; label: string };
  pipeline: {
    openCount: number;
    openValue: number;
    byStage: Record<string, { count: number; value: number }>;
    byVendor: Record<string, { count: number; value: number }>;
  };
  closed: {
    won: { count: number; value: number };
    lost: { count: number; value: number };
    winRate: number;
  };
  topDeals: Array<{
    id: string;
    title: string;
    account: string;
    stage: string;
    value: number | null;
  }>;
  topAccounts: Array<{ id: string; name: string; dealCount: number; totalValue: number }>;
  activity: { total: number; byType: Record<string, number> };
  newAccounts: Array<{ id: string; name: string; industry: string | null }>;
  meetings: number;
}

export interface WinLossMetrics {
  totalClosed: number;
  won: number;
  lost: number;
  winRate: number;
  avgWonValue: number;
  avgLostValue: number;
  wonValue: number;
  lostValue: number;
  byVendor: Record<string, { won: number; lost: number; winRate: number; wonValue: number }>;
  byProductLine: Record<string, { won: number; lost: number; winRate: number }>;
  topWinReasons: Array<{ reason: string; count: number }>;
  topLossReasons: Array<{ reason: string; count: number }>;
  avgCycleDays: number | null;
  sampleWon: Array<{ id: string; title: string; account: string; value: number | null; reason: string | null }>;
  sampleLost: Array<{ id: string; title: string; account: string; value: number | null; reason: string | null }>;
}

export interface WinLossReport {
  id: string;
  userId: string;
  title: string;
  filters: { from?: string; to?: string; vendor?: string; productLine?: string };
  metrics: WinLossMetrics;
  aiInsights: string;
  createdAt: string;
}

export interface ProposalSection {
  id: string;
  heading: string;
  body: string;
  order: number;
}

export interface ProposalInputs {
  clientName?: string;
  industry?: string;
  requirements?: string;
  valueProps?: string;
  timeline?: string;
  budget?: string;
  vendors?: string[];
}

export interface Proposal {
  id: string;
  title: string;
  status: "draft" | "ready" | "sent" | "accepted" | "rejected";
  language: "vi" | "en";
  version: number;
  accountId: string | null;
  dealId: string | null;
  sections: ProposalSection[];
  inputs: ProposalInputs;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  vendor: string;
  sku: string | null;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  listPrice: number;
  partnerCost: number | null;
  currency: string;
  active: boolean;
  createdAt: string;
}

export interface QuotationLineItem {
  id: string;
  productId?: string | null;
  name: string;
  description?: string;
  vendor?: string;
  qty: number;
  unitPrice: number;
  discount: number;
  unit?: string;
  lineTotal: number;
}

export interface RFPRequirement {
  id: string;
  category: string;
  priority: "must" | "should" | "nice";
  text: string;
  response?: string;
  status?: "pending" | "drafted" | "approved";
  confidence?: "high" | "medium" | "low";
}

export interface RFPResponse {
  id: string;
  userId: string;
  title: string;
  clientName: string | null;
  deadline: string | null;
  rawContent: string;
  requirements: RFPRequirement[];
  status: "draft" | "in_progress" | "submitted";
  accountId: string | null;
  dealId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RFPSummary {
  id: string;
  title: string;
  clientName: string | null;
  deadline: string | null;
  status: "draft" | "in_progress" | "submitted";
  createdAt: string;
  updatedAt: string;
  totalRequirements: number;
  draftedResponses: number;
}

export interface ChatCitation {
  type: "product";
  id: string;
  label: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  citations?: ChatCitation[];
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Competitor {
  id: string;
  name: string;
  vendor: string | null;
  website: string | null;
  strengths: string | null;
  weaknesses: string | null;
  pricing: string | null;
  notes: string | null;
  swotAnalysis: string | null;
  swotAt: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  _count?: { intel: number };
  intel?: CompetitorIntel[];
  competingDeals?: Array<{
    id: string;
    title: string;
    value: number | null;
    stage: string;
    vendor: string | null;
    account: { id: string; companyName: string } | null;
  }>;
}

export interface CompetitorIntel {
  id: string;
  competitorId: string;
  type: "news" | "pricing" | "win_against" | "loss_to" | "rumor" | "feature";
  content: string;
  source: string | null;
  impact: "high" | "medium" | "low" | null;
  userId: string;
  createdAt: string;
}

export interface MarketSizing {
  id: string;
  userId: string;
  title: string;
  segment: string;
  region: string;
  vertical: string | null;
  inputs: {
    segment?: string;
    region?: string;
    vertical?: string;
    productCategory?: string;
    timeframe?: string;
    notes?: string;
    assumptions?: string[];
    drivers?: string[];
    competitorLandscape?: string;
    reasoning?: string;
  };
  tam: number;
  sam: number;
  som: number;
  analysis: string;
  createdAt: string;
}

export interface Quotation {
  id: string;
  number: string;
  title: string;
  accountId: string | null;
  dealId: string | null;
  currency: string;
  items: QuotationLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}
