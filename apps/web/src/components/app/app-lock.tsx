'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_LOCK_IDLE_MS } from '@khata/shared';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { verifyPin } from '@/lib/security/pin';

/**
 * §4.1: an optional 4-digit PIN, asked for when the app returns to the
 * foreground after five minutes away. This is the P0 stand-in for biometrics.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations('lock');
  const { settings } = useApp();
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const hiddenSince = useRef<number | null>(null);

  const enabled = Boolean(settings?.app_lock_enabled && settings.pin_hash);

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince.current = Date.now();
        return;
      }
      const away = hiddenSince.current === null ? 0 : Date.now() - hiddenSince.current;
      hiddenSince.current = null;
      if (away >= APP_LOCK_IDLE_MS) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled]);

  const unlock = useCallback(async () => {
    const ok = await verifyPin(pin, settings?.pin_hash ?? null);
    if (ok) {
      setLocked(false);
      setPin('');
      setError(false);
    } else {
      setError(true);
      setPin('');
    }
  }, [pin, settings?.pin_hash]);

  if (!locked) return <>{children}</>;

  return (
    <div
      data-testid="lock-screen"
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-4 p-6"
    >
      <h1 className="text-body font-semibold">{t('title')}</h1>
      <input
        autoFocus
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        aria-label={t('title')}
        data-testid="lock-pin"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className="tabular h-14 w-40 rounded-card border border-border bg-surface text-center text-amount tracking-[0.4em]"
      />
      {error && <p className="text-label text-expense">{t('wrong')}</p>}
      <Button variant="primary" size="lg" className="w-40" onClick={() => void unlock()}>
        {t('unlock')}
      </Button>
    </div>
  );
}
