/**
 * Component library barrel.
 *
 * Ten reusable primitives, one import surface. Every component is presentation
 * only: no component fetches data, runs a calculation or holds a secret.
 */

export { Badge, EpistemicBadge, ProvenanceBadge } from './Badge';
export type { BadgeProps, BadgeTone } from './Badge';

export { Button, IconButton } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Section,
} from './Card';
export type { CardProps } from './Card';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps, ErrorSeverity } from './ErrorState';

export { Field, Input, ReadOnlyValue, Textarea } from './Input';
export type { FieldProps } from './Input';

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

export { Skeleton, SkeletonCard } from './Skeleton';
export type { SkeletonProps, SkeletonShape } from './Skeleton';

export { TabPanel, Tabs } from './Tabs';
export type { TabItem, TabsProps } from './Tabs';

export { Tooltip, TooltipProvider } from './Tooltip';
export type { TooltipProps } from './Tooltip';

export { ProvenanceBanner } from './ProvenanceBanner';
export type { ProvenanceBannerProps } from './ProvenanceBanner';

export { ChartAdapter } from './charts/ChartAdapter';
export type { ChartAdapterProps, ChartBar } from './charts/ChartAdapter';
export { Sparkline } from './charts/Sparkline';
export type { SparklineProps } from './charts/Sparkline';
