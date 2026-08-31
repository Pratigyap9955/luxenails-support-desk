import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { TicketsPage } from "./pages/Tickets";
import { TicketDetailPage } from "./pages/TicketDetail";
import { TriagePage } from "./pages/Triage";
import { KnowledgeBasePage } from "./pages/KnowledgeBase";
import { CustomersPage } from "./pages/Customers";
import { SlaMonitorPage } from "./pages/SlaMonitor";
import { EscalationsPage } from "./pages/Escalations";
import { AnalyticsPage } from "./pages/Analytics";
import { SettingsPage } from "./pages/Settings";

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-luxe-gradient">
        <div className="flex flex-col items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-plum-gradient text-2xl shadow-lift">
            💅
          </span>
          <Spinner />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route path="/triage" element={<TriagePage />} />
        <Route path="/knowledge" element={<KnowledgeBasePage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/sla" element={<SlaMonitorPage />} />
        <Route path="/escalations" element={<EscalationsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
