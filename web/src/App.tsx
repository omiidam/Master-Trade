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
 * It owns exactly one side effect — mirroring the chosen writing direction onto
 * <html dir> — because RTL must be a document-level property for logical
 * properties, native form controls and screen readers to behave correctly.
 */
export function App() {
  const page = useUiStore((state) => state.page);
  const direction = useUiStore((state) => state.direction);
  const initializeRealtime = useRealtimeStore((state) => state.initialize);

  useEffect(() => {
    document.documentElement.dir = direction;
  }, [direction]);

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
