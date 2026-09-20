import { Bell, Languages, Monitor, Search, ShieldCheck, WifiOff } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button, IconButton } from '../components/Button';
import { Input } from '../components/Input';
import { Tooltip } from '../components/Tooltip';
import { findNavSection, PREVIEW_NOTICE } from '../config/navigation';
import { useShellStatus } from '../desktop/useShellStatus';
import { useUiStore } from '../store/ui';

/**
 * Topbar: context, honesty about connectivity, and global affordances.
 *
 * The preview badge and the offline indicator are permanent on purpose — the
 * interface must never look like a live trading terminal when it is neither
 * connected nor permitted to trade.
 */
export function Topbar() {
  const page = useUiStore((state) => state.page);
  const direction = useUiStore((state) => state.direction);
  const toggleDirection = useUiStore((state) => state.toggleDirection);
  const openSafety = useUiStore((state) => state.setSafetyDialogOpen);
  const openAbout = useUiStore((state) => state.setAboutDialogOpen);
  const section = findNavSection(page);
  const shell = useShellStatus();

  // Where this page is running is stated, never implied: in a browser there is no
  // keychain, no offline cache and no local API, and the shell says which of those
  // it currently has.
  const apiReady = shell.status?.sidecarState === 'ready';
  const shellLabel = shell.loading
    ? 'Checking host…'
    : shell.inShell
      ? apiReady
        ? 'Desktop shell'
        : `Desktop shell · API ${shell.status?.sidecarState ?? 'unknown'}`
      : 'Browser preview';
  const shellTooltip = shell.loading
    ? 'Asking the desktop shell what it can do.'
    : shell.error
      ? `The host did not answer: ${shell.error}. Assuming no keychain, no offline cache and no local API.`
      : shell.inShell
        ? apiReady
          ? `Desktop shell v${shell.status?.appVersion ?? '?'} on ${shell.status?.platform ?? '?'}. The local API answers on ${shell.status?.apiBaseUrl ?? 'a loopback port'}.`
          : `The bundled local API is ${shell.status?.sidecarState ?? 'not running'}; the interface stays usable but nothing is connected.`
        : 'Running in a browser: no OS keychain, no offline cache and no local API. Credentials cannot be stored from here.';

  return (
    <header className="sticky top-0 z-[var(--z-shell)] border-b border-border bg-bg/85 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <div className="min-w-0 grow basis-40">
          <h1 className="truncate text-title font-semibold text-text">{section.label}</h1>
          <p className="truncate text-caption text-text-muted">{section.description}</p>
        </div>

        <Tooltip content={PREVIEW_NOTICE}>
          <button
            type="button"
            onClick={() => openAbout(true)}
            className="rounded-[var(--radius-pill)]"
          >
            <Badge tone="warning" dot>
              Preview · mock data
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

        <Tooltip content="No real-time connection in this phase (WebSocket transport is not mounted yet).">
          <Badge tone="neutral" icon={<WifiOff size={12} aria-hidden />}>
            Offline
          </Badge>
        </Tooltip>

        <div className="relative hidden xl:block">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 start-2.5 my-auto text-text-faint"
          />
          <Input
            className="w-64 ps-8"
            placeholder="Search lessons, sessions, notes"
            aria-label="Search"
            disabled
            title="Search arrives with the API layer in Phase 3.3"
          />
        </div>

        <Tooltip
          content={
            direction === 'ltr'
              ? 'Switch to right-to-left layout'
              : 'Switch to left-to-right layout'
          }
        >
          <IconButton
            label="Toggle writing direction"
            variant="secondary"
            onClick={toggleDirection}
            aria-pressed={direction === 'rtl'}
          >
            <Languages size={16} aria-hidden />
          </IconButton>
        </Tooltip>

        <Tooltip content="Notifications and job events arrive with the realtime layer.">
          <IconButton label="Notifications" variant="secondary" className="relative">
            <Bell size={16} aria-hidden />
            <span
              aria-hidden
              className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning"
            />
          </IconButton>
        </Tooltip>

        <Button
          variant="subtle"
          leadingIcon={<ShieldCheck size={15} aria-hidden />}
          onClick={() => openSafety(true)}
        >
          Safety
        </Button>
      </div>
    </header>
  );
}
