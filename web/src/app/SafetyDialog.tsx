import { Ban, Eye, KeyRound, ShieldCheck } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { useUiStore } from '../store/ui';

const GUARANTEES = [
  {
    icon: <Ban size={15} aria-hidden className="mt-0.5 shrink-0 text-danger" />,
    title: 'No live trading and no broker execution',
    detail:
      'No operation id, tool, job kind or configuration key exists for either. The safety flags are typed as literal false, so no value can switch them on.',
  },
  {
    icon: <ShieldCheck size={15} aria-hidden className="mt-0.5 shrink-0 text-primary" />,
    title: 'Deterministic math owns every number',
    detail:
      'Position sizing, R-multiples and risk metrics come from typed tools with tests. The model explains; it never computes a risk figure.',
  },
  {
    icon: <Eye size={15} aria-hidden className="mt-0.5 shrink-0 text-info" />,
    title: 'Epistemic labels on every statement',
    detail:
      'Fact, analysis, hypothesis and uncertainty are rendered explicitly, and unverified memory enters context as uncertainty — never as fact.',
  },
  {
    icon: <KeyRound size={15} aria-hidden className="mt-0.5 shrink-0 text-warning" />,
    title: 'Human approval for anything that changes rules',
    detail:
      'A proposed rule cannot activate without an evaluation and a recorded human approval. The requester cannot approve their own proposal.',
  },
];

/** Safety details: the user can always confirm what this system cannot do. */
export function SafetyDialog() {
  const open = useUiStore((state) => state.safetyDialogOpen);
  const setOpen = useUiStore((state) => state.setSafetyDialogOpen);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Safety posture"
      description="What this workstation is allowed to do, and what it structurally cannot do."
      footer={
        <>
          <Badge tone="primary" dot>
            training mode
          </Badge>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        </>
      }
    >
      <ul className="space-y-4">
        {GUARANTEES.map((item) => (
          <li key={item.title} className="flex gap-3">
            {item.icon}
            <div>
              <p className="text-body font-medium text-text">{item.title}</p>
              <p className="mt-0.5 text-caption text-text-muted">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-caption text-text-faint">
        These guarantees are asserted at start-up and covered by tests; if any of them regressed,
        the build would fail before this interface could run.
      </p>
    </Modal>
  );
}
