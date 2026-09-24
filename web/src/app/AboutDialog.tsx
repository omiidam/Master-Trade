import { Badge } from '../components/Badge';
import { BrandLockup } from '../components/brand';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { MOCK_DATA_NOTICE, MOCK_GENERATED_AT } from '../mock/data';
import { PREVIEW_NOTICE } from '../config/navigation';
import { useUiStore } from '../store/ui';
import { CardTile } from '../components/Card';

const REAL = [
  'Design tokens, theme and the component library',
  'Application shell, navigation and layout system',
  'Safety messaging, provenance and epistemic labels',
  'Backend architecture, permissions and deterministic tools (Phase 1–2, tested)',
];

const NOT_WIRED = [
  'No model provider is connected (the scripted offline adapter is the default)',
  'No database, no persistence and no repositories in the frontend',
  'No realtime connection, no jobs running, no market data feed',
  'No order entry, no broker link and no execution path — by design, not by omission',
];

/** Honest inventory of what is real vs. illustrative in this preview. */
export function AboutDialog() {
  const open = useUiStore((state) => state.aboutDialogOpen);
  const setOpen = useUiStore((state) => state.setAboutDialogOpen);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="About this preview"
      description={PREVIEW_NOTICE}
      footer={
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        {/* This dialog is where the interface explains itself, so it is where the full
            lockup belongs: the mark and the wordmark, at the size the product uses. */}
        <BrandLockup markSize={44} subtitle="Smarter trading. Bigger possibilities." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section>
            <h3 className="text-body font-medium text-text">Real in this build</h3>
            <ul className="mt-2 space-y-1.5">
              {REAL.map((item) => (
                <li key={item} className="flex gap-2 text-caption text-text-muted">
                  <Badge tone="primary">yes</Badge>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-body font-medium text-text">Not wired yet</h3>
            <ul className="mt-2 space-y-1.5">
              {NOT_WIRED.map((item) => (
                <li key={item} className="flex gap-2 text-caption text-text-muted">
                  <Badge tone="warning">later</Badge>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <CardTile className="text-caption text-text-faint">
          {MOCK_DATA_NOTICE} Preview snapshot: {MOCK_GENERATED_AT}.
        </CardTile>
      </div>
    </Modal>
  );
}
