import { Bell, Languages, Search, ShieldCheck, WifiOff } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button, IconButton } from '../components/Button';
import { Input } from '../components/Input';
import { Tooltip } from '../components/Tooltip';
import { findNavSection, PREVIEW_NOTICE } from '../config/navigation';
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

        <Tooltip content="No real-time connection in this phase (WebSocket transport is Phase 3.3).">
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
