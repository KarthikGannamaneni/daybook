'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { UNDO_WINDOW_MS } from '@khata/shared';

/**
 * §6.2: the undo toast slides up from the bottom with a progress bar draining
 * over 8 seconds; the bar running out is what commits the destructive action.
 *
 * CSS-only, because this component is mounted on the home screen and the home
 * screen has a bundle budget (§10.6).
 */

interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Runs when the toast expires without the action being taken. */
  onExpire?: () => void;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
  durationMs: number;
}

const ToastContext = createContext<{ show: (options: ToastOptions) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [entered, setEntered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const dismiss = useCallback((expired: boolean, current: ToastState) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setEntered(false);
    setToast((active) => (active?.id === current.id ? null : active));
    if (expired) current.onExpire?.();
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      const current: ToastState = {
        ...options,
        id: nextId.current++,
        durationMs: options.durationMs ?? UNDO_WINDOW_MS,
      };
      setEntered(false);
      setToast(current);
      timer.current = setTimeout(() => dismiss(true, current), current.durationMs);
    },
    [dismiss],
  );

  // Enter on the frame after mount so the transition has something to move from.
  useEffect(() => {
    if (!toast) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [toast]);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          data-testid="toast"
          style={{ transform: entered ? 'translateY(0)' : 'translateY(5rem)', opacity: entered ? 1 : 0 }}
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-50 overflow-hidden rounded-card border border-border bg-surface shadow-lg transition-[transform,opacity] duration-transition ease-out"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-body">{toast.message}</p>
            {toast.actionLabel && (
              <button
                type="button"
                data-testid="toast-action"
                className="shrink-0 text-body font-semibold text-accent"
                onClick={() => {
                  toast.onAction?.();
                  dismiss(false, toast);
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
          <div
            className="h-0.5 origin-left bg-accent motion-safe:animate-drain"
            style={{ animationDuration: `${toast.durationMs}ms` }}
          />
        </div>
      )}
    </ToastContext.Provider>
  );
}
