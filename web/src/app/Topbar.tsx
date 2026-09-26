import { Bell, Languages, Monitor, Search, ShieldCheck } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button, IconButton } from '../components/Button';
import { Input } from '../components/Input';
import { Tooltip } from '../components/Tooltip';
import { ConnectionStatus } from '../components/realtime/ConnectionStatus';
import { findNavSection, previewNotice } from '../config/navigation';
import { useShellStatus } from '../desktop/useShellStatus';
import { PROCESS_STATE_LABEL } from '@shared/desktop/process';
import { useRealtimeStore } from '../realtime/store.js';
import { useUiStore } from '../store/ui';
import { msg, useTextDirection } from '../i18n/index.js';

/**
 * Topbar: context, honesty about connectivity, and global affordances.
 *
 * The preview badge and the offline indicator are permanent on purpose — the
 * interface must never look like a live trading terminal when it is neither
 * connected nor permitted to trade.
 */
export function Topbar() {
  const page = useUiStore((state) => state.page);
  // What is on screen, not what is stored: the stored value may be `auto`, and a control that says "switch
  // to right-to-left" while the interface is already right-to-left is a control nobody can predict.
  const direction = useTextDirection();
  const toggleDirection = useUiStore((state) => state.toggleDirection);
  const openSafety = useUiStore((state) => state.setSafetyDialogOpen);
  const openAbout = useUiStore((state) => state.setAboutDialogOpen);
  const section = findNavSection(page);
  const shell = useShellStatus();
  const setPage = useUiStore((state) => state.setPage);
  // The real state of the event stream, on every page: the chip is the same control
  // the Activity page leads with, so "live" in the topbar means the same thing.
  const streamState = useRealtimeStore((state) => state.state);
  const streamSnapshot = useRealtimeStore((state) => state.snapshot);
  const notices = useRealtimeStore((state) => state.notifications.length);

  // Where this page is running is stated, never implied: in a browser there is no
  // keychain, no offline cache and no local API, and the shell says which of those
  // it currently has.
  // The derived state, not the raw one: `runtimeState` already collapses the nine process states
  // into the words a person reads, and it is the same value every other screen branches on.
  const apiReady = shell.runtimeState === 'ready';
  const shellLabel = shell.loading
    ? 'Checking host…'
    : shell.inShell
      ? apiReady
        ? 'Desktop shell'
        : `Desktop shell · API ${shell.runtimeState}`
      : 'Browser preview';
  const shellTooltip = shell.loading
    ? 'Asking the desktop shell what it can do.'
    : shell.error
      ? `The host did not answer: ${shell.error}. Assuming no keychain, no offline cache and no local API.`
      : shell.inShell
        ? apiReady
          ? `Desktop shell v${shell.status?.appVersion ?? '?'} on ${shell.status?.platform ?? '?'}. The local API answers on ${shell.status?.apiBaseUrl ?? 'a loopback port'}.`
          : `${PROCESS_STATE_LABEL[shell.processState]} The interface stays usable but nothing is connected.`
        : 'Running in a browser: no OS keychain, no offline cache and no local API. Credentials cannot be stored from here.';

  return (
    <header className="sticky top-0 z-[var(--z-shell)] border-b border-border bg-bg/85 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <div className="min-w-0 grow basis-40">
          <h1 className="truncate text-title font-semibold text-text">{msg(section.labelKey)}</h1>
          <p className="truncate text-caption text-text-muted">{msg(section.descriptionKey)}</p>
        </div>

        <Tooltip content={previewNotice()}>
          <button
            type="button"
            onClick={() => openAbout(true)}
            className="rounded-[var(--radius-pill)]"
          >
            <Badge tone="warning" dot>
              {msg('shell.previewMockData')}
            </Badge>
          </button>
        </Tooltip>

        <Tooltip content={shellTooltip}>
          <Badge
            tone={shell.inShell ? (apiReady ? 'info' : 'warning') : 'neutral'}
            icon={<Monitor size={12} aria-hidden />}
          >
            {shellLabel}
          </Badge>
        </Tooltip>

        <Tooltip
          content={
            streamSnapshot?.detail ??
            'The event stream has not been opened in this page yet; the Activity page connects.'
          }
        >
          <button
            type="button"
            onClick={() => setPage('activity')}
            className="rounded-[var(--radius-pill)]"
          >
            <ConnectionStatus state={streamState} detail={streamSnapshot?.detail} compact />
          </button>
        </Tooltip>

        <div className="relative hidden xl:block">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 start-2.5 my-auto text-text-faint"
          />
          <Input
            className="w-64 ps-8"
            placeholder={msg('shell.searchLessonsSessionsNotes')}
            aria-label={msg('shell.search')}
            disabled
            title={msg('shell.searchArrivesWithTheAPILayer')}
          />
        </div>

        <Tooltip
          content={
            direction === 'ltr'
              ? msg('topbar.switchToRightToLeftLayout')
              : msg('topbar.switchToLeftToRightLayout')
          }
        >
          <IconButton
            label={msg('topbar.toggleWritingDirection')}
            variant="secondary"
            onClick={toggleDirection}
            aria-pressed={direction === 'rtl'}
          >
            <Languages size={16} aria-hidden />
          </IconButton>
        </Tooltip>

        <Tooltip
          content={
            notices === 0
              ? 'No notices yet: open Activity to watch the event stream and the background-task queue.'
              : `${notices} notice(s) in this session — open Activity to read them.`
          }
        >
          <IconButton
            label={msg('topbar.notificationsAndBackgroundTasks')}
            variant="secondary"
            className="relative"
            onClick={() => setPage('activity')}
          >
            <Bell size={16} aria-hidden />
            {notices > 0 ? (
              <span
                aria-hidden
                className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning"
              />
            ) : null}
          </IconButton>
        </Tooltip>

        <Button
          variant="subtle"
          leadingIcon={<ShieldCheck size={15} aria-hidden />}
          onClick={() => openSafety(true)}
        >
          {msg('shell.safety')}
        </Button>
      </div>
    </header>
  );
}
