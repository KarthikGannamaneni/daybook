'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_LOCK_IDLE_MS } from '@khata/shared';
import { useQuery } from '@tanstack/react-query';
import { Fingerprint } from 'lucide-react';
import { useApp } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { verifyPasskey } from '@/lib/security/passkey';
import { verifyPin } from '@/lib/security/pin';

/**
 * §4.1: an optional 4-digit PIN, asked for when the app returns to the
 * foreground after five minutes away. This is the P0 stand-in for biometrics.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations('lock');
  const tPass = useTranslations('passkeys');
  const { settings, repo } = useApp();
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const hiddenSince = useRef<number | null>(null);

  // P1 #1: a passkey satisfies the lock on its own, so the PIN is no longer
  // required for the lock to be meaningful.
  const passkeysQuery = useQuery({
    queryKey: ['passkeys'],
    queryFn: () => repo!.listPasskeys(),
    enabled: Boolean(repo && settings?.app_lock_enabled),
  });
  // Stable identity, or the unlock callback is rebuilt on every render.
  const passkeys = useMemo(() => passkeysQuery.data ?? [], [passkeysQuery.data]);
  const enabled = Boolean(settings?.app_lock_enabled && (settings.pin_hash || passkeys.length > 0));

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

  const unlockWithPasskey = useCallback(async () => {
    try {
      const used = await verifyPasskey(passkeys.map((k) => k.credential_id));
      await repo?.touchPasskey(used);
      setLocked(false);
      setError(false);
    } catch {
      setError(true);
    }
  }, [passkeys, repo]);

  if (!locked) return <>{children}</>;

  return (
    <div
      data-testid="lock-screen"
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-4 p-6"
    >
      <h1 className="text-body font-semibold">
        {passkeys.length > 0 && !settings?.pin_hash ? tPass('unlock') : t('title')}
      </h1>

      {passkeys.length > 0 && (
        <Button
          variant="primary"
          size="lg"
          className="w-56"
          data-testid="unlock-passkey"
          onClick={() => void unlockWithPasskey()}
        >
          <Fingerprint className="h-5 w-5" aria-hidden />
          {tPass('unlock')}
        </Button>
      )}

      {settings?.pin_hash && (
        <>
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
      <Button variant="quiet" size="lg" className="w-40" onClick={() => void unlock()}>
        {t('unlock')}
      </Button>
        </>
      )}

      {error && <p className="text-label text-expense">{settings?.pin_hash ? t('wrong') : tPass('failed')}</p>}
    </div>
  );
}
