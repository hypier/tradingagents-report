import { Route, Routes } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { HomePage } from '../pages/home-page';
import { NotFoundPage } from '../pages/not-found-page';
import { ReportPage } from '../pages/report-page';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
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
