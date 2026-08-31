import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { CandidateProfilePage } from './pages/CandidateProfilePage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { PositionsPage } from './pages/PositionsPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { ShortlistPage } from './pages/ShortlistPage';
import { InterviewsPage } from './pages/InterviewsPage';
import { FinalSelectionPage } from './pages/FinalSelectionPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ImportDataPage } from './pages/ImportDataPage';
import { DataQualityPage } from './pages/DataQualityPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { SettingsPage } from './pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="candidates" element={<CandidatesPage />} />
            <Route path="candidates/:id" element={<CandidateProfilePage />} />
            <Route path="applications" element={<ApplicationsPage />} />
            <Route path="positions" element={<PositionsPage />} />
            <Route path="evaluation" element={<EvaluationPage />} />
            <Route path="shortlist" element={<ShortlistPage />} />
            <Route path="interviews" element={<InterviewsPage />} />
            <Route path="final-selection" element={<FinalSelectionPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="import" element={<ImportDataPage />} />
            <Route path="data-quality" element={<DataQualityPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
