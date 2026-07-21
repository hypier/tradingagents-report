import { Route, Routes } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { HomePage } from '../pages/home-page';
import { NotFoundPage } from '../pages/not-found-page';
import { ReportPage } from '../pages/report-page';
import { ReportsPage } from '../pages/reports-page';
import { AdminUsersPage } from '../pages/admin-users-page';
import { AdminUserDetailPage } from '../pages/admin-user-detail-page';
import { AdminBillingPage } from '../pages/admin-billing-page';
import { AdminOverviewPage } from '../pages/admin-overview-page';
import { AdminAnalysesPage } from '../pages/admin-analyses-page';
import { AdminModelsPage } from '../pages/admin-models-page';
import { AdminSettingsPage } from '../pages/admin-settings-page';
import { AdminMarketsPage } from '../pages/admin-markets-page';
import { AdminAuditPage } from '../pages/admin-audit-page';
import { BillingPage } from '../pages/billing-page';
import { AccountPage } from '../pages/account-page';
import { LegalPage } from '../pages/legal-page';
import { SharedReportPage } from '../pages/shared-report-page';
import { WatchlistPage } from '../pages/watchlist-page';
import { QuotesPage } from '../pages/quotes-page';
import { StockPage } from '../pages/stock-page';
import { TasksPage } from '../pages/tasks-page';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/tasks" element={<TasksPage />} />
      <Route path="/quotes" element={<QuotesPage />} />
      <Route path="/watchlist" element={<WatchlistPage />} />
      <Route path="/stocks/:providerSymbol" element={<StockPage />} />
      <Route path="/admin" element={<AdminOverviewPage />} />
      <Route path="/admin/users" element={<AdminUsersPage />} />
      <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
      <Route path="/admin/analyses" element={<AdminAnalysesPage />} />
      <Route path="/admin/billing" element={<AdminBillingPage />} />
      <Route path="/admin/models" element={<AdminModelsPage />} />
      <Route path="/admin/settings" element={<AdminSettingsPage />} />
      <Route path="/admin/markets" element={<AdminMarketsPage />} />
      <Route path="/admin/audit" element={<AdminAuditPage />} />
      <Route path="/billing" element={<BillingPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/legal/:document" element={<LegalPage />} />
      <Route path="/shared/:token" element={<SharedReportPage />} />
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
