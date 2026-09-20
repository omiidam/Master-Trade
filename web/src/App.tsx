import { useEffect } from 'react';
import { AppShell } from './app/AppShell';
import { AboutDialog } from './app/AboutDialog';
import { SafetyDialog } from './app/SafetyDialog';
import { TooltipProvider } from './components/Tooltip';
import type { AppPageId } from './config/navigation';
import { AcademyPage } from './pages/AcademyPage';
import { AgentWorkspacePage } from './pages/AgentWorkspacePage';
import { DashboardPage } from './pages/DashboardPage';
import { ExamsPage } from './pages/ExamsPage';
import { MemoryPage } from './pages/MemoryPage';
import { ResearchPage } from './pages/ResearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { TradingLabPage } from './pages/TradingLabPage';
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
    case 'academy':
      return <AcademyPage />;
    case 'exams':
      return <ExamsPage />;
    case 'lab':
      return <TradingLabPage />;
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

  useEffect(() => {
    document.documentElement.dir = direction;
  }, [direction]);

  return (
    <TooltipProvider>
      <AppShell>{renderPage(page)}</AppShell>
      <SafetyDialog />
      <AboutDialog />
    </TooltipProvider>
  );
}
