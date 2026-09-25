import { Ban, Eye, KeyRound, ShieldCheck } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { useUiStore } from '../store/ui';
import { msg } from '../i18n/index.js';

const GUARANTEES = [
  {
    icon: <Ban size={15} aria-hidden className="mt-0.5 shrink-0 text-danger" />,
    get title(): string {
      return msg('safetyDialog.noLiveTradingAndNoBrokerExecution');
    },
    get detail(): string {
      return msg('safetyDialog.noOperationIdToolJobKindOrConfiguration');
    },
  },
  {
    icon: <ShieldCheck size={15} aria-hidden className="mt-0.5 shrink-0 text-primary" />,
    get title(): string {
      return msg('safetyDialog.deterministicMathOwnsEveryNumber');
    },
    get detail(): string {
      return msg('safetyDialog.positionSizingRMultiplesAndRiskMetricsComeFrom');
    },
  },
  {
    icon: <Eye size={15} aria-hidden className="mt-0.5 shrink-0 text-info" />,
    get title(): string {
      return msg('safetyDialog.epistemicLabelsOnEveryStatement');
    },
    get detail(): string {
      return msg('safetyDialog.factAnalysisHypothesisAndUncertaintyAreRenderedExpli');
    },
  },
  {
    icon: <KeyRound size={15} aria-hidden className="mt-0.5 shrink-0 text-warning" />,
    get title(): string {
      return msg('safetyDialog.humanApprovalForAnythingThatChangesRules');
    },
    get detail(): string {
      return msg('safetyDialog.aProposedRuleCannotActivateWithoutAnEvaluation');
    },
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
      title={msg('shell.safetyPosture')}
      description={msg('safetyDialog.whatThisWorkstationIsAllowedToDoAnd')}
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
        {msg('shell.theseGuaranteesAreAssertedAtStart')}
      </p>
    </Modal>
  );
}
