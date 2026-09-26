import { useEffect } from 'react';
import { AppShell } from './app/AppShell';
import { AboutDialog } from './app/AboutDialog';
import { SafetyDialog } from './app/SafetyDialog';
import { ToastProvider } from './components/Toast';
import { TooltipProvider } from './components/Tooltip';
import type { AppPageId } from './config/navigation';
import { AcademyPage } from './pages/AcademyPage';
import { ActivityPage } from './pages/ActivityPage';
import { AgentWorkspacePage } from './pages/AgentWorkspacePage';
import { DashboardPage } from './pages/DashboardPage';
import { ExamsPage } from './pages/ExamsPage';
import { JournalPage } from './pages/JournalPage';
import { MemoryPage } from './pages/MemoryPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { ProfilePage } from './pages/ProfilePage';
import { ResearchPage } from './pages/ResearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { TradingLabPage } from './pages/TradingLabPage';
import { UsagePage } from './pages/UsagePage';
import { useRealtimeStore } from './realtime/store.js';
import { useUiStore } from './store/ui';

function renderPage(page: AppPageId) {
  switch (page) {
    case 'dashboard':
      return <DashboardPage />;
    case 'agent':
      return <AgentWorkspacePage />;
    case 'memory':
      return <MemoryPage />;
    case 'research':
      return <ResearchPage />;
    case 'journal':
      return <JournalPage />;
    case 'portfolio':
      return <PortfolioPage />;
    case 'evaluation':
      return <EvaluationPage />;
    case 'academy':
      return <AcademyPage />;
    case 'exams':
      return <ExamsPage />;
    case 'lab':
      return <TradingLabPage />;
    case 'activity':
      return <ActivityPage />;
    case 'usage':
      return <UsagePage />;
    case 'profile':
      return <ProfilePage />;
    case 'settings':
      return <SettingsPage />;
  }
}

/**
 * Root component.
 *
 * It owns exactly one side effect — resolving the realtime session once, at start-up, so the connection
 * status in the topbar is honest on every page. That resolves credentials and nothing else: the socket
 * itself is opened by the Activity page, and only there.
 *
 * The document's locale is *not* here. `<html lang>` and `<html dir>` are one decision made in one place —
 * `useDocumentLanguage`, which the shell calls — because both are derived from the language setting, and two
 * effects writing the same element is how the two end up disagreeing. `main.tsx` applies the same rule once
 * before the first paint, so a Persian reader never sees a left-to-right frame.
 */
export function App() {
  const page = useUiStore((state) => state.page);
  const initializeRealtime = useRealtimeStore((state) => state.initialize);

  // Resolve the realtime session once, at start-up, so the connection status in the
  // topbar is honest on every page. This resolves credentials and nothing else: the
  // socket itself is opened by the Activity page, and only there.
  useEffect(() => {
    void initializeRealtime();
  }, [initializeRealtime]);

  return (
    <TooltipProvider>
      {/* The toast queue is one per application, above the shell so a message about a dialog is
          readable over it. Nothing raises a toast outside the surfaces that own a message. */}
      <ToastProvider>
        <AppShell>{renderPage(page)}</AppShell>
        <SafetyDialog />
        <AboutDialog />
      </ToastProvider>
    </TooltipProvider>
  );
}
