import { Route, Routes } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { HomePage } from '../pages/home-page';
import { NotFoundPage } from '../pages/not-found-page';
import { ReportPage } from '../pages/report-page';
import { ReportsPage } from '../pages/reports-page';
import { AdminUsersPage } from '../pages/admin-users-page';
import { AdminBillingPage } from '../pages/admin-billing-page';
import { BillingPage } from '../pages/billing-page';
import { AccountPage } from '../pages/account-page';
import { LegalPage } from '../pages/legal-page';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin/users" element={<AdminUsersPage />} />
      <Route path="/admin/billing" element={<AdminBillingPage />} />
      <Route path="/billing" element={<BillingPage />} />
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
