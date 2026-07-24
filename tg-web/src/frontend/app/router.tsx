import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { DashboardPage } from '../pages/dashboard-page';
import { HomePage } from '../pages/home-page';
import { NotFoundPage } from '../pages/not-found-page';
import { ReportPage } from '../pages/report-page';
import { ReportsPage } from '../pages/reports-page';
import { AdminUsersPage } from '../pages/admin-users-page';
import { AdminUserDetailPage } from '../pages/admin-user-detail-page';
import { AdminAnalysisBillingPage } from '../pages/admin-analysis-billing-page';
import { AdminBillingPage } from '../pages/admin-billing-page';
import { AdminOverviewPage } from '../pages/admin-overview-page';
import { AdminAnalysesPage } from '../pages/admin-analyses-page';
import { AdminAnalysisInterpretPage } from '../pages/admin-analysis-interpret-page';
import { AdminCreditsLedgerPage } from '../pages/admin-credits-ledger-page';
import { AdminCreditsLedgerDetailPage } from '../pages/admin-credits-ledger-detail-page';
import { AdminLlmProvidersPage } from '../pages/admin-llm-providers-page';
import { AdminLlmModelsPage } from '../pages/admin-llm-models-page';
import { AdminSettingsPage } from '../pages/admin-settings-page';
import { AdminMarketsPage } from '../pages/admin-markets-page';
import { AdminAuditPage } from '../pages/admin-audit-page';
import { SubscriptionPage } from '../pages/subscription-page';
import { UsagePage } from '../pages/usage-page';
import { InvoicesPage } from '../pages/invoices-page';
import { AccountPage } from '../pages/account-page';
import { LegalPage } from '../pages/legal-page';
import { WatchlistPage } from '../pages/watchlist-page';
import { QuotesPage } from '../pages/quotes-page';
import { StockPage } from '../pages/stock-page';
import { TasksPage } from '../pages/tasks-page';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/desk" element={<HomePage />} />
      <Route path="/tasks" element={<TasksPage />} />
      <Route path="/quotes" element={<QuotesPage />} />
      <Route path="/watchlist" element={<WatchlistPage />} />
      <Route path="/stocks/:providerSymbol" element={<StockPage />} />
      <Route path="/admin" element={<AdminOverviewPage />} />
      <Route path="/admin/users" element={<AdminUsersPage />} />
      <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
      <Route path="/admin/analyses" element={<AdminAnalysesPage />} />
      <Route
        path="/admin/analyses/:id"
        element={<AdminAnalysisInterpretPage />}
      />
      <Route path="/admin/credits" element={<AdminCreditsLedgerPage />} />
      <Route
        path="/admin/credits/:id"
        element={<AdminCreditsLedgerDetailPage />}
      />
      <Route path="/admin/billing" element={<AdminBillingPage />} />
      <Route
        path="/admin/billing/analysis"
        element={<AdminAnalysisBillingPage />}
      />
      <Route
        path="/admin/models"
        element={<Navigate to="/admin/llm/providers" replace />}
      />
      <Route path="/admin/llm/providers" element={<AdminLlmProvidersPage />} />
      <Route path="/admin/llm/models" element={<AdminLlmModelsPage />} />
      <Route path="/admin/settings" element={<AdminSettingsPage />} />
      <Route path="/admin/markets" element={<AdminMarketsPage />} />
      <Route path="/admin/audit" element={<AdminAuditPage />} />
      <Route
        path="/billing"
        element={<Navigate replace to="/billing/subscription" />}
      />
      <Route path="/billing/subscription" element={<SubscriptionPage />} />
      <Route path="/billing/invoices" element={<InvoicesPage />} />
      <Route path="/billing/usage" element={<UsagePage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/legal/:document" element={<LegalPage />} />
      <Route
        path="/reports"
        element={
          <AppShell>
            <ReportsPage />
          </AppShell>
        }
      />
      <Route
        path="/reports/:id"
        element={
          <AppShell>
            <ReportPage />
          </AppShell>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
