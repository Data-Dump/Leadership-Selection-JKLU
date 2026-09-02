import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { EvaluatorDashboardPage } from './pages/EvaluatorDashboardPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { CandidateProfilePage } from './pages/CandidateProfilePage';
import { PositionsPage } from './pages/PositionsPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { ShortlistPage } from './pages/ShortlistPage';
import { FinalSelectionPage } from './pages/FinalSelectionPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DataQualityPage } from './pages/DataQualityPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { SettingsPage } from './pages/SettingsPage';

import { PrintDossierPage } from './pages/PrintDossierPage';

function DashboardRouter() {
  const { user } = useAuth();
  if (user?.role === 'Evaluator') {
    return <Navigate to="/evaluator/dashboard" replace />;
  }
  return <DashboardPage />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardRouter />} />
            <Route path="evaluator/dashboard" element={<EvaluatorDashboardPage />} />
            <Route path="evaluator" element={<Navigate to="/evaluator/dashboard" replace />} />
            <Route path="candidates" element={<CandidatesPage />} />
            <Route path="candidates/:id" element={<CandidateProfilePage />} />
            <Route path="dossier" element={<PrintDossierPage />} />
            <Route path="print-dossier" element={<PrintDossierPage />} />
            <Route path="applications" element={<Navigate to="/candidates" replace />} />
            <Route path="positions" element={<PositionsPage />} />

            <Route path="evaluation" element={<EvaluationPage />} />
            <Route path="shortlist" element={<ShortlistPage />} />
            <Route path="final-selection" element={<FinalSelectionPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="import" element={<Navigate to="/dashboard" replace />} />
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

