import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TOAST_DURATIONS } from '../design/components';
import { DURATION, EASE } from '../design/motion';
import { cn } from '../lib/cn';
import { Alert, type AlertTone } from './Alert';

export interface ToastOptions {
  /** Re-using an id replaces the existing toast rather than stacking a second copy of it. */
  id?: string;
  tone?: AlertTone;
  title: string;
  /**
   * A human sentence. Never a raw payload, an exception message or a provider response — this is
   * the same rule the inline `Alert` follows, and it is why the API takes a string rather than an
   * `Error`.
   */
  description?: ReactNode;
  actions?: ReactNode;
  /** Overrides the tone's default. `0` pins the toast until it is dismissed. */
  duration?: number;
}

interface ToastRecord {
  id: string;
  tone: AlertTone;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  duration: number;
}

export interface ToastApi {
  /** Raises a toast and returns its id, so a caller can replace or dismiss it later. */
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** The toast API. Throws rather than no-oping, so a missing provider is a bug and not a silence. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error('useToast must be called inside <ToastProvider>');
  }
  return api;
}

/**
 * Owns the toast queue and renders the viewport.
 *
 * The queue is deliberately tiny — no reducer, no persistence, no cross-tab channel — because a
 * toast is a transient acknowledgement of something that just happened in this tab. Anything that
 * must survive a reload belongs in the Activity feed, which reads it from the server.
 *
 * `limit` is the memory bound: the queue keeps the most recent few and drops the rest, so a
 * component that raises a toast in a render loop cannot grow the array without bound.
 */
export function ToastProvider({ children, limit = 4 }: { children: ReactNode; limit?: number }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      counter.current += 1;
      const id = options.id ?? `toast-${counter.current}`;
      const tone = options.tone ?? 'neutral';
      const record: ToastRecord = {
        id,
        tone,
        title: options.title,
        duration: options.duration ?? TOAST_DURATIONS[tone],
        ...(options.description === undefined ? {} : { description: options.description }),
        ...(options.actions === undefined ? {} : { actions: options.actions }),
      };
      setToasts((current) => [...current.filter((entry) => entry.id !== id), record].slice(-limit));
      return id;
    },
    [limit],
  );

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * Where toasts appear: a stack at the bottom, full width on a phone and a fixed column on a
 * desktop, above the modal layer (`--z-toast`) so a message about a dialog is readable over it.
 *
 * `pointer-events-none` on the region and `auto` on each toast means the empty area around a
 * stack never swallows a click meant for the page — a fixed container that covers the bottom of
 * every screen is otherwise a dead zone.
 *
 * The container carries no `aria-live` of its own: each toast already has `role="status"` or
 * `role="alert"` from `alertRole`, and a live region wrapping live regions announces every message
 * twice.
 */
export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: readonly ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="region"
      aria-label="Notifications"
      className={cn(
        'pointer-events-none fixed bottom-3 start-3 end-3 z-[var(--z-toast)]',
        'flex flex-col items-stretch gap-2',
        'sm:bottom-6 sm:start-auto sm:end-6 sm:w-96 sm:items-end',
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((record) => (
          <ToastItem key={record.id} record={record} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({
  record,
  onDismiss,
}: {
  record: ToastRecord;
  onDismiss: (id: string) => void;
}) {
  const reduceMotion = useReducedMotion();

  /*
   * Hover and focus pause the timer, and leaving restarts it rather than resuming a countdown —
   * there is no per-toast clock to restore, and "the whole duration again" is both simpler and
   * what people expect when they come back to read it. Focusing the toast counts as reading it,
   * which is why `onFocusCapture` is here and not only the pointer events.
   */
  const [paused, setPaused] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (paused || record.duration <= 0) return;
    const timer = window.setTimeout(() => dismiss.current(record.id), record.duration);
    return () => window.clearTimeout(timer);
  }, [paused, record.duration, record.id]);

  // Same shape as the dialog's: a preset object, or nothing at all under reduced motion.
  const animation = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 12, scale: 0.98 },
        transition: { duration: DURATION.base, ease: EASE.emphasis },
      };

  return (
    <motion.div
      {...animation}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="pointer-events-auto w-full"
    >
      <Alert
        tone={record.tone}
        title={record.title}
        {...(record.description === undefined ? {} : { description: record.description })}
        {...(record.actions === undefined ? {} : { actions: record.actions })}
        onDismiss={() => onDismiss(record.id)}
        dismissLabel="Dismiss this notification"
        floating
      />
    </motion.div>
  );
}
